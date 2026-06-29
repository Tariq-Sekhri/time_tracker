use crate::db::{get_pool, Error};
use anyhow::Result;
use sqlx::SqlitePool;
pub const META_GOOGLE_CLIENT_ID: &str = "google_oauth_client_id";
pub const META_GOOGLE_CLIENT_SECRET: &str = "google_oauth_client_secret";
pub const META_CALENDAR_VIEW_PREFS: &str = "calendar_view_prefs_v1";
pub const META_LOCAL_DEVICE_UUID: &str = "local_device_uuid_v1";

pub async fn metadata_get(pool: &SqlitePool, key: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await
}
pub const SERVER_IP: &str = "server_ip";

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
