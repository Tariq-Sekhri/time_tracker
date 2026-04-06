use crate::db::get_pool;
use crate::db::tables::app_metadata_kv::{self, META_GOOGLE_CLIENT_ID, META_GOOGLE_CLIENT_SECRET};
use crate::db::tables::google_calendar::{
    delete_google_oauth, get_google_oauth, save_google_oauth, update_google_oauth_tokens,
    NewGoogleOAuth,
};
use crate::db::error::{AuthExpiredError, Error};
use anyhow::Context;
use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::Mutex;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REDIRECT_PORT: u16 = 8742;

fn open_auth_url(url: &str) -> Result<(), Error> {
    #[cfg(target_os = "linux")]
    {
        let openers: [(&str, &[&str]); 4] = [
            ("xdg-open", &[url]),
            ("gio", &["open", url]),
            ("firefox", &[url]),
            ("snap", &["run", "firefox", url]),
        ];
        for (cmd, args) in openers {
            if Command::new(cmd).args(args).spawn().is_ok() {
                return Ok(());
            }
        }
        return Err(anyhow::anyhow!("Failed to open browser on Linux").into());
    }
    #[cfg(not(target_os = "linux"))]
    {
        tauri_plugin_opener::open_url(url, None::<&str>).context("Failed to open browser")?;
        Ok(())
    }
}

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

struct OAuthState {
    code: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GoogleOAuthAppCredentials {
    pub client_id: String,
    pub client_secret: String,
}

pub async fn resolve_google_oauth_app_credentials() -> Result<(String, String), Error> {
    let pool = get_pool().await?;
    let client_id = app_metadata_kv::metadata_get(&pool, META_GOOGLE_CLIENT_ID)
        .await?
        .unwrap_or_default();
    let client_secret = app_metadata_kv::metadata_get(&pool, META_GOOGLE_CLIENT_SECRET)
        .await?
        .unwrap_or_default();
    if client_id.is_empty() || client_secret.is_empty() {
        return Err(anyhow::anyhow!(
            "Google OAuth app credentials not configured. Set them in the app or database."
        )
        .into());
    }
    Ok((client_id, client_secret))
}

#[tauri::command]
pub async fn get_google_oauth_app_credentials() -> Result<GoogleOAuthAppCredentials, Error> {
    let pool = get_pool().await?;
    let client_id = app_metadata_kv::metadata_get(&pool, META_GOOGLE_CLIENT_ID)
        .await?
        .unwrap_or_default();
    let client_secret = app_metadata_kv::metadata_get(&pool, META_GOOGLE_CLIENT_SECRET)
        .await?
        .unwrap_or_default();
    Ok(GoogleOAuthAppCredentials {
        client_id,
        client_secret,
    })
}

#[tauri::command]
pub async fn set_google_oauth_app_credentials(
    client_id: String,
    client_secret: String,
) -> Result<(), Error> {
    let pool = get_pool().await?;
    app_metadata_kv::metadata_set(&pool, META_GOOGLE_CLIENT_ID, &client_id).await?;
    app_metadata_kv::metadata_set(&pool, META_GOOGLE_CLIENT_SECRET, &client_secret).await?;
    Ok(())
}

#[tauri::command]
pub async fn google_oauth_login() -> Result<AuthStatus, Error> {
    let (client_id, client_secret) = resolve_google_oauth_app_credentials().await?;
    let client = BasicClient::new(
        ClientId::new(client_id),
        Some(ClientSecret::new(client_secret)),
        AuthUrl::new(GOOGLE_AUTH_URL.to_string())
            .context("Invalid auth URL")?,
        Some(
            TokenUrl::new(GOOGLE_TOKEN_URL.to_string())
                .context("Invalid token URL")?,
        ),
    )
    .set_redirect_uri(
        RedirectUrl::new(format!("http://localhost:{}/oauth/callback", REDIRECT_PORT))
            .context("Invalid redirect URL")?,
    );

    let (auth_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new(
            "https://www.googleapis.com/auth/calendar".to_string(),
        ))
        .add_scope(Scope::new(
            "https://www.googleapis.com/auth/userinfo.email".to_string(),
        ))
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .url();

    let state = Arc::new(Mutex::new(OAuthState {
        code: None,
        error: None,
    }));

    let server_state = state.clone();
    let server_handle = tokio::spawn(async move {
        if let Err(e) = start_callback_server(server_state.clone()).await {
            let mut lock = server_state.lock().await;
            lock.error = Some(e.to_string());
        }
    });

    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    let auth_url_str = auth_url.to_string();
    open_auth_url(&auth_url_str)?;

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(120);
    
    let code = loop {
        {
            let state_lock = state.lock().await;
            if let Some(error) = &state_lock.error {
                return Err(anyhow::anyhow!("OAuth error: {}", error).into());
            }
            if let Some(code) = &state_lock.code {
                let code = code.clone();
                drop(state_lock);
                break code;
            }
        }
        
        if start.elapsed() > timeout {
            return Err(anyhow::anyhow!("OAuth timeout - no response received. Please make sure the redirect URI http://localhost:8742/oauth/callback is added in Google Cloud Console.").into());
        }
        
        if server_handle.is_finished() {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            let state_lock = state.lock().await;
            if let Some(code) = &state_lock.code {
                let code = code.clone();
                drop(state_lock);
                break code;
            }
            if state_lock.code.is_none() && state_lock.error.is_none() {
                drop(state_lock);
                let _ = server_handle.await;
                return Err(anyhow::anyhow!("No authorization code received. Please check that the redirect URI http://localhost:8742/oauth/callback is correctly configured in Google Cloud Console.").into());
            }
        }
        
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    };

    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(oauth2::reqwest::async_http_client)
        .await
        .map_err(|e| match e {
            oauth2::RequestTokenError::ServerResponse(err) => {
                let desc = err
                    .error_description()
                    .map(|s| format!(" - {}", s))
                    .unwrap_or_default();
                let uri = err
                    .error_uri()
                    .map(|u| format!(" ({})", u))
                    .unwrap_or_default();
                anyhow::anyhow!("Failed to exchange code for token: {}{}{}", err.error(), desc, uri)
            }
            oauth2::RequestTokenError::Request(err) => {
                anyhow::anyhow!("Failed to exchange code for token: request failed: {}", err)
            }
            oauth2::RequestTokenError::Parse(err, body) => anyhow::anyhow!(
                "Failed to exchange code for token: could not parse response: {} - {}",
                err,
                String::from_utf8_lossy(&body)
            ),
            oauth2::RequestTokenError::Other(msg) => {
                anyhow::anyhow!("Failed to exchange code for token: {}", msg)
            }
        })?;

    let access_token = token_result.access_token().secret().to_string();
    let refresh_token = token_result
        .refresh_token()
        .ok_or_else(|| anyhow::anyhow!("No refresh token received"))?
        .secret()
        .to_string();

    let expires_at = chrono::Utc::now().timestamp()
        + token_result
            .expires_in()
            .map(|d| d.as_secs() as i64)
            .unwrap_or(3600);

    let email = get_user_email(&access_token).await?;

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

#[tauri::command]
pub async fn google_oauth_logout() -> Result<(), Error> {
    delete_google_oauth().await?;
    Ok(())
}

pub async fn get_valid_access_token(client_id: &str, client_secret: &str) -> Result<String, Error> {
    let oauth = get_google_oauth()
        .await?
        .ok_or_else(|| anyhow::anyhow!("Not logged in"))?;

    let now = chrono::Utc::now().timestamp();

    if oauth.expires_at > now + 300 {
        return Ok(oauth.access_token);
    }

    let http_client = reqwest::Client::new();
    let refresh_response = http_client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", oauth.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| {
            Error::from(AuthExpiredError(format!("Failed to reach Google token endpoint: {}", e)))
        })?;

    let status = refresh_response.status();
    let response_body = refresh_response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(AuthExpiredError(format!(
            "Google token refresh failed ({}): {}. Please re-login to Google Calendar.",
            status, response_body
        )).into());
    }

    let token_data: serde_json::Value = serde_json::from_str(&response_body)
        .map_err(|e| {
            Error::from(AuthExpiredError(format!("Failed to parse token refresh response: {}", e)))
        })?;

    let new_access_token = token_data["access_token"]
        .as_str()
        .ok_or_else(|| {
            Error::from(AuthExpiredError("No access_token in refresh response".to_string()))
        })?
        .to_string();

    let expires_in = token_data["expires_in"].as_i64().unwrap_or(3600);
    let new_expires_at = now + expires_in;

    update_google_oauth_tokens(&new_access_token, new_expires_at).await?;

    Ok(new_access_token)
}

async fn start_callback_server(state: Arc<Mutex<OAuthState>>) -> Result<(), anyhow::Error> {
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
    
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("Port {} is already in use. Please close any other applications using this port.", REDIRECT_PORT))?;

    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                let state = server_state.lock().await;
                if state.code.is_some() || state.error.is_some() {
                    break;
                }
            }
        })
        .await?;
    Ok(())
}

async fn oauth_callback(
    Query(params): Query<AuthCallback>,
    state: Arc<Mutex<OAuthState>>,
) -> Html<String> {
    if let Some(error) = params.error {
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
        {
            let mut state = state.lock().await;
            state.code = Some(code.clone());
        }
        
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        
        return Html(
            r#"
            <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                    <h1 style="color: #4caf50;">✓ Authentication Successful</h1>
                    <p>You can close this window and return to the app.</p>
                    <script>
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

async fn get_user_email(access_token: &str) -> Result<String, Error> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .context("Failed to get user info")?;

    let status = response.status();
    let response_text = response.text().await
        .context("Failed to read user info response")?;
    
    if !status.is_success() {
        return Err(anyhow::anyhow!("Userinfo API returned error: {} - {}", status, response_text).into());
    }

    let user_info: serde_json::Value = serde_json::from_str(&response_text)
        .context("Failed to parse user info JSON")?;

    let email = user_info.get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            user_info.get("sub").and_then(|v| v.as_str()).map(|s| format!("{}@gmail.com", s))
        })
        .ok_or_else(|| {
            anyhow::anyhow!("No email in user info. Available fields: {:?}", user_info.as_object().map(|o| o.keys().collect::<Vec<_>>()))
        })?;

    Ok(email)
}
