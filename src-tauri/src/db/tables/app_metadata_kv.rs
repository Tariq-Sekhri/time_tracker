use crate::db::get_pool;
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

pub async fn metadata_set(pool: &SqlitePool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_server_ip() -> Result<Option<String>, sqlx::Error> {
    let pool = get_pool().await?;
    sqlx::query_scalar::<_, String>("select value from app_metadata where key = ?")
        .bind(SERVER_IP.to_string())
        .fetch_optional(&pool)
        .await
}

pub const SERVER_IP: &str = "server_ip";
pub async fn set_server_ip(pool: &SqlitePool, server_ip: String) -> Result<()> {
    let pool = get_pool().await?;
    sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?")
        .bind(server_ip)
        .bind(SERVER_IP.to_string())
        .execute(&pool)
        .await?;
    Ok(())
}
