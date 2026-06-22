use sqlx::SqlitePool;

pub const META_GOOGLE_CLIENT_ID: &str = "google_oauth_client_id";
pub const META_GOOGLE_CLIENT_SECRET: &str = "google_oauth_client_secret";
pub const META_CALENDAR_VIEW_PREFS: &str = "calendar_view_prefs_v1";
pub const META_LOCAL_DEVICE_UUID: &str = "local_device_uuid_v1";
pub const META_SERVER_IP: &str = "server_ip";

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

pub async fn get_server_ip(pool: &SqlitePool) -> Result<Option<String>, sqlx::Error> {
    metadata_get(pool, META_SERVER_IP).await
}

pub async fn set_server_ip(pool: &SqlitePool, ip: &str) -> Result<(), sqlx::Error> {
    metadata_set(pool, META_SERVER_IP, ip.trim()).await
}
