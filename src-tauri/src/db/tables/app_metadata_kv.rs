use sqlx::SqlitePool;

pub const META_GOOGLE_CLIENT_ID: &str = "google_oauth_client_id";
pub const META_GOOGLE_CLIENT_SECRET: &str = "google_oauth_client_secret";
pub const META_CALENDAR_VIEW_PREFS: &str = "calendar_view_prefs_v1";

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
