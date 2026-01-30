use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct GoogleOAuth {
    pub id: i32,
    pub email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewGoogleOAuth {
    pub email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct GoogleCalendar {
    pub id: i32,
    pub google_calendar_id: String,  // Google's calendar ID (e.g., "primary" or email)
    pub name: String,
    pub color: String,
    pub account_email: String,  // Links to google_oauth.email
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewGoogleCalendar {
    pub google_calendar_id: String,
    pub name: String,
    pub color: String,
    pub account_email: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateGoogleCalendar {
    pub id: i32,
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleCalendarInfo {
    pub google_calendar_id: String,
    pub name: String,
    pub color: String,
    pub access_role: String,
    pub selected: bool,  // Whether this calendar is currently added
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS google_oauth (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS google_calendar_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            google_calendar_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            account_email TEXT NOT NULL,
            FOREIGN KEY (account_email) REFERENCES google_oauth(email) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    Ok(())
}


pub async fn get_google_oauth() -> Result<Option<GoogleOAuth>, Error> {
    let pool = db::get_pool().await?;
    let oauth = sqlx::query_as!(
        GoogleOAuth,
        r#"SELECT id as "id!: i32", email, access_token, refresh_token, expires_at as "expires_at!: i64", created_at as "created_at!: i64" FROM google_oauth LIMIT 1"#
    )
    .fetch_optional(&pool)
    .await?;
    Ok(oauth)
}

pub async fn save_google_oauth(oauth: NewGoogleOAuth) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    
    sqlx::query!("DELETE FROM google_oauth")
        .execute(&pool)
        .await?;
    
    let result = sqlx::query!(
        "INSERT INTO google_oauth (email, access_token, refresh_token, expires_at) VALUES (?1, ?2, ?3, ?4)",
        oauth.email,
        oauth.access_token,
        oauth.refresh_token,
        oauth.expires_at
    )
    .execute(&pool)
    .await?;
    
    Ok(result.last_insert_rowid())
}

pub async fn update_google_oauth_tokens(access_token: &str, expires_at: i64) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query!(
        "UPDATE google_oauth SET access_token = ?1, expires_at = ?2",
        access_token,
        expires_at
    )
    .execute(&pool)
    .await?;
    Ok(())
}

pub async fn delete_google_oauth() -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    sqlx::query!("DELETE FROM google_calendar_v2")
        .execute(&pool)
        .await?;
    
    sqlx::query!("DELETE FROM google_oauth")
        .execute(&pool)
        .await?;
    
    Ok(())
}


#[tauri::command]
pub async fn get_google_calendars() -> Result<Vec<GoogleCalendar>, Error> {
    let pool = db::get_pool().await?;
    let calendars = sqlx::query_as!(
        GoogleCalendar,
        r#"SELECT id as "id!: i32", google_calendar_id, name, color, account_email FROM google_calendar_v2 ORDER BY name"#
    )
    .fetch_all(&pool)
    .await?;
    Ok(calendars)
}

#[tauri::command]
pub async fn get_google_calendar_by_id(id: i32) -> Result<GoogleCalendar, Error> {
    let pool = db::get_pool().await?;
    let calendar = sqlx::query_as!(
        GoogleCalendar,
        r#"SELECT id as "id!: i32", google_calendar_id, name, color, account_email FROM google_calendar_v2 WHERE id = ?1"#,
        id
    )
    .fetch_one(&pool)
    .await?;
    Ok(calendar)
}

pub async fn get_google_calendar_by_google_id(google_calendar_id: &str) -> Result<Option<GoogleCalendar>, Error> {
    let pool = db::get_pool().await?;
    let calendar = sqlx::query_as!(
        GoogleCalendar,
        r#"SELECT id as "id!: i32", google_calendar_id, name, color, account_email FROM google_calendar_v2 WHERE google_calendar_id = ?1"#,
        google_calendar_id
    )
    .fetch_optional(&pool)
    .await?;
    Ok(calendar)
}

#[tauri::command]
pub async fn insert_google_calendar(new_calendar: NewGoogleCalendar) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let result = sqlx::query!(
        "INSERT INTO google_calendar_v2 (google_calendar_id, name, color, account_email) VALUES (?1, ?2, ?3, ?4)",
        new_calendar.google_calendar_id,
        new_calendar.name,
        new_calendar.color,
        new_calendar.account_email
    )
    .execute(&pool)
    .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_google_calendar(update: UpdateGoogleCalendar) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    let mut updates = Vec::new();
    if let Some(name) = update.name {
        updates.push(format!("name = '{}'", name.replace("'", "''")));
    }
    if let Some(color) = update.color {
        updates.push(format!("color = '{}'", color.replace("'", "''")));
    }
    
    if updates.is_empty() {
        return Ok(());
    }
    
    let query = format!("UPDATE google_calendar_v2 SET {} WHERE id = ?1", updates.join(", "));
    sqlx::query(&query)
        .bind(update.id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_google_calendar(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    sqlx::query!("DELETE FROM google_calendar_v2 WHERE id = ?1", id)
        .execute(&pool)
        .await?;
    Ok(())
}

pub async fn delete_google_calendar_by_google_id(google_calendar_id: &str) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    sqlx::query!("DELETE FROM google_calendar_v2 WHERE google_calendar_id = ?1", google_calendar_id)
        .execute(&pool)
        .await?;
    Ok(())
}
