use crate::db::{get_pool, Error};
use anyhow::Result;
use serde::Serialize;
use sqlx::SqlitePool;
pub const META_GOOGLE_CLIENT_ID: &str = "google_oauth_client_id";
pub const META_GOOGLE_CLIENT_SECRET: &str = "google_oauth_client_secret";
pub const META_CALENDAR_VIEW_PREFS: &str = "calendar_view_prefs_v1";
pub const META_LOCAL_DEVICE_UUID: &str = "local_device_uuid_v1";
pub const SERVER_IP: &str = "server_ip";
pub const DEFAULT_SERVER_IP: &str = "100.75.95.90";
pub const META_NOTES_ENABLED: &str = "notes_enabled";
pub const META_NOTES_TEXT: &str = "notes_text";

#[derive(Serialize)]
pub struct NotesState {
    pub enabled: bool,
    pub text: String,
}

pub async fn metadata_get(pool: &SqlitePool, key: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await
}
pub async fn ensure_default_server_ip(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    if metadata_get(pool, SERVER_IP).await?.is_none() {
        metadata_set(pool, SERVER_IP, DEFAULT_SERVER_IP).await?;
    }
    Ok(())
}

pub async fn metadata_set(pool: &SqlitePool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_server_ip() -> Result<Option<String>, Error> {
    let pool = get_pool().await?;
    Ok(metadata_get(&pool, SERVER_IP).await?)
}

#[tauri::command]
pub async fn set_server_ip(server_ip: String) -> Result<(), Error> {
    let pool = get_pool().await?;
    metadata_set(&pool, SERVER_IP, &server_ip).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_notes_state() -> Result<NotesState, Error> {
    let pool = get_pool().await?;
    let enabled = metadata_get(&pool, META_NOTES_ENABLED).await?.as_deref() == Some("true");
    let text = metadata_get(&pool, META_NOTES_TEXT)
        .await?
        .unwrap_or_default();
    Ok(NotesState { enabled, text })
}

#[tauri::command]
pub async fn set_notes_enabled(enabled: bool) -> Result<(), Error> {
    let pool = get_pool().await?;
    metadata_set(
        &pool,
        META_NOTES_ENABLED,
        if enabled { "true" } else { "false" },
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn set_notes_text(text: String) -> Result<(), Error> {
    let pool = get_pool().await?;
    metadata_set(&pool, META_NOTES_TEXT, &text).await?;
    Ok(())
}
