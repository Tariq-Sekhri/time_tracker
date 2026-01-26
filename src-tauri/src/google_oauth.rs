use crate::db::tables::google_calendar::{
    delete_google_oauth, get_google_oauth, save_google_oauth, update_google_oauth_tokens,
    NewGoogleOAuth,
};
use crate::db::Error;
use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    RedirectUrl, RefreshToken, Scope, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REDIRECT_PORT: u16 = 8742;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthStatus {
    pub logged_in: bool,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AuthCallback {
    code: Option<String>,
    error: Option<String>,
}

// Shared state for the OAuth callback
struct OAuthState {
    code: Option<String>,
    error: Option<String>,
}

/// Start the OAuth flow - opens browser and returns when complete
#[tauri::command]
pub async fn google_oauth_login(
    client_id: String,
    client_secret: String,
) -> Result<AuthStatus, Error> {
    // Create OAuth client
    let client = BasicClient::new(
        ClientId::new(client_id),
        Some(ClientSecret::new(client_secret)),
        AuthUrl::new(GOOGLE_AUTH_URL.to_string())
            .map_err(|e| Error::Other(format!("Invalid auth URL: {}", e)))?,
        Some(
            TokenUrl::new(GOOGLE_TOKEN_URL.to_string())
                .map_err(|e| Error::Other(format!("Invalid token URL: {}", e)))?,
        ),
    )
    .set_redirect_uri(
        RedirectUrl::new(format!("http://localhost:{}/oauth/callback", REDIRECT_PORT))
            .map_err(|e| Error::Other(format!("Invalid redirect URL: {}", e)))?,
    );

    // Generate the authorization URL
    let (auth_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new(
            "https://www.googleapis.com/auth/calendar".to_string(),
        ))
        .add_scope(Scope::new(
            "https://www.googleapis.com/auth/userinfo.email".to_string(),
        ))
        .add_extra_param("access_type", "offline") // Get refresh token
        .add_extra_param("prompt", "consent") // Force consent screen to get refresh token
        .url();

    // Shared state for the callback
    let state = Arc::new(Mutex::new(OAuthState {
        code: None,
        error: None,
    }));

    // Start local HTTP server
    let server_state = state.clone();
    let server_handle = tokio::spawn(start_callback_server(server_state));

    // Give server a moment to start
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Open browser
    let auth_url_str = auth_url.to_string();
    tauri_plugin_opener::open_url(&auth_url_str, None::<&str>)
        .map_err(|e| Error::Other(format!("Failed to open browser: {}", e)))?;

    // Wait for callback - poll state directly with timeout
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(120);
    
    let code = loop {
        // Check state
        {
            let state_lock = state.lock().await;
            if let Some(error) = &state_lock.error {
                return Err(Error::Other(format!("OAuth error: {}", error)));
            }
            if let Some(code) = &state_lock.code {
                let code = code.clone();
                drop(state_lock);
                break code;
            }
        }
        
        // Check timeout
        if start.elapsed() > timeout {
            return Err(Error::Other("OAuth timeout - no response received. Please make sure the redirect URI http://localhost:8742/oauth/callback is added in Google Cloud Console.".to_string()));
        }
        
        // Check if server completed (non-blocking check)
        if server_handle.is_finished() {
            // Give a moment for code to be stored after server shutdown
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            // Final check after server shutdown
            let state_lock = state.lock().await;
            if let Some(code) = &state_lock.code {
                let code = code.clone();
                drop(state_lock);
                break code;
            }
            if state_lock.code.is_none() && state_lock.error.is_none() {
                drop(state_lock);
                // Await the server handle to see if there was an error
                let _ = server_handle.await;
                return Err(Error::Other("No authorization code received. Please check that the redirect URI http://localhost:8742/oauth/callback is correctly configured in Google Cloud Console.".to_string()));
            }
        }
        
        // Poll every 100ms
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    };

    // Exchange code for token
    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(oauth2::reqwest::async_http_client)
        .await
        .map_err(|e| Error::Other(format!("Failed to exchange code for token: {}", e)))?;

    let access_token = token_result.access_token().secret().to_string();
    let refresh_token = token_result
        .refresh_token()
        .ok_or_else(|| Error::Other("No refresh token received".to_string()))?
        .secret()
        .to_string();

    let expires_at = chrono::Utc::now().timestamp()
        + token_result
            .expires_in()
            .map(|d| d.as_secs() as i64)
            .unwrap_or(3600);

    // Get user email from Google
    let email = get_user_email(&access_token).await?;

    // Save to database
    save_google_oauth(NewGoogleOAuth {
        email: email.clone(),
        access_token,
        refresh_token,
        expires_at,
    })
    .await?;

    Ok(AuthStatus {
        logged_in: true,
        email: Some(email),
    })
}

/// Get current auth status
#[tauri::command]
pub async fn get_google_auth_status() -> Result<AuthStatus, Error> {
    let oauth = get_google_oauth().await?;

    Ok(match oauth {
        Some(oauth) => AuthStatus {
            logged_in: true,
            email: Some(oauth.email),
        },
        None => AuthStatus {
            logged_in: false,
            email: None,
        },
    })
}

/// Logout - clear stored tokens
#[tauri::command]
pub async fn google_oauth_logout() -> Result<(), Error> {
    delete_google_oauth().await?;
    Ok(())
}

/// Get a valid access token, refreshing if necessary
pub async fn get_valid_access_token(
    client_id: &str,
    client_secret: &str,
) -> Result<String, Error> {
    let oauth = get_google_oauth()
        .await?
        .ok_or_else(|| Error::Other("Not logged in".to_string()))?;

    let now = chrono::Utc::now().timestamp();

    // If token is still valid (with 5 minute buffer), return it
    if oauth.expires_at > now + 300 {
        return Ok(oauth.access_token);
    }

    // Token expired, refresh it
    let client = BasicClient::new(
        ClientId::new(client_id.to_string()),
        Some(ClientSecret::new(client_secret.to_string())),
        AuthUrl::new(GOOGLE_AUTH_URL.to_string())
            .map_err(|e| Error::Other(format!("Invalid auth URL: {}", e)))?,
        Some(
            TokenUrl::new(GOOGLE_TOKEN_URL.to_string())
                .map_err(|e| Error::Other(format!("Invalid token URL: {}", e)))?,
        ),
    );

    let token_result = client
        .exchange_refresh_token(&RefreshToken::new(oauth.refresh_token))
        .request_async(oauth2::reqwest::async_http_client)
        .await
        .map_err(|e| Error::Other(format!("Failed to refresh token: {}", e)))?;

    let new_access_token = token_result.access_token().secret().to_string();
    let new_expires_at = now
        + token_result
            .expires_in()
            .map(|d| d.as_secs() as i64)
            .unwrap_or(3600);

    // Update database
    update_google_oauth_tokens(&new_access_token, new_expires_at).await?;

    Ok(new_access_token)
}

/// Start the callback server
async fn start_callback_server(state: Arc<Mutex<OAuthState>>) {
    let app_state = state.clone();
    let app = Router::new()
        .route("/oauth/callback", get({
            let state = app_state.clone();
            move |query| oauth_callback(query, state.clone())
        }))
        .route("/", get(|| async { 
            Html(r#"
                <html>
                    <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                        <h1>OAuth Callback Server</h1>
                        <p>Server is running and ready to receive OAuth callbacks.</p>
                    </body>
                </html>
            "#.to_string())
        }));

    let addr = SocketAddr::from(([127, 0, 0, 1], REDIRECT_PORT));

    let server_state = state.clone();
    
    // Try to bind - if port is in use, try a different approach
    let listener = tokio::net::TcpListener::bind(addr).await
        .expect(&format!("Port {} is already in use. Please close any other applications using this port.", REDIRECT_PORT));

    let _ = axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(async move {
            // Wait for code to be received
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                let state = server_state.lock().await;
                if state.code.is_some() || state.error.is_some() {
                    break;
                }
            }
        })
        .await;
}

/// OAuth callback handler
async fn oauth_callback(
    Query(params): Query<AuthCallback>,
    state: Arc<Mutex<OAuthState>>,
) -> Html<String> {
    if let Some(error) = params.error {
        // Store error
        let mut state = state.lock().await;
        state.error = Some(error.clone());
        drop(state);
        
        return Html(format!(
            r#"
            <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1 style="color: #d32f2f;">Authentication Failed</h1>
                    <p>Error: {}</p>
                    <p>You can close this window.</p>
                </body>
            </html>
            "#,
            error
        ));
    }

    if let Some(code) = params.code {
        // Store code
        {
            let mut state = state.lock().await;
            state.code = Some(code.clone());
        }
        
        // Give a moment for the state to be read before shutdown
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        
        return Html(
            r#"
            <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1 style="color: #4caf50;">✓ Authentication Successful</h1>
                    <p>You can close this window and return to the app.</p>
                    <script>
                        // Auto-close after 2 seconds
                        setTimeout(() => window.close(), 2000);
                    </script>
                </body>
            </html>
            "#
            .to_string(),
        );
    }

    Html(
        r#"
        <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1 style="color: #ff9800;">Invalid Request</h1>
                <p>No authorization code received.</p>
                <p>You can close this window.</p>
            </body>
        </html>
        "#
        .to_string(),
    )
}

/// Get user email from Google userinfo endpoint
async fn get_user_email(access_token: &str) -> Result<String, Error> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| Error::Other(format!("Failed to get user info: {}", e)))?;

    let status = response.status();
    let response_text = response.text().await
        .map_err(|e| Error::Other(format!("Failed to read user info response: {}", e)))?;
    
    if !status.is_success() {
        return Err(Error::Other(format!("Userinfo API returned error: {} - {}", status, response_text)));
    }

    let user_info: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| Error::Other(format!("Failed to parse user info JSON: {} - Response: {}", e, &response_text[..response_text.len().min(200)])))?;

    // Try to get email from the response
    let email = user_info.get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            // Fallback: try to get it from other fields
            user_info.get("sub").and_then(|v| v.as_str()).map(|s| format!("{}@gmail.com", s))
        })
        .ok_or_else(|| {
            Error::Other(format!("No email in user info. Available fields: {:?}", user_info.as_object().map(|o| o.keys().collect::<Vec<_>>())))
        })?;

    Ok(email)
}
