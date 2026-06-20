use crate::db::tables::app_metadata_kv::{metadata_get, metadata_set};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

const META_LOCAL_DEVICE_UUID: &str = "local_device_uuid_v1";

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct Device {
    pub id: i64,
    pub uuid: String,
    pub name: String,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_or_create_local_device_id(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    create_table(pool).await?;

    let name = local_device_name();
    let uuid = match metadata_get(pool, META_LOCAL_DEVICE_UUID).await? {
        Some(uuid) if uuid::Uuid::parse_str(uuid.trim()).is_ok() => uuid.trim().to_string(),
        _ => {
            let uuid = uuid::Uuid::new_v4().to_string();
            metadata_set(pool, META_LOCAL_DEVICE_UUID, &uuid).await?;
            uuid
        }
    };

    sqlx::query(
        "INSERT INTO devices (uuid, name)
         VALUES (?1, ?2)
         ON CONFLICT(uuid) DO UPDATE SET name = excluded.name",
    )
    .bind(&uuid)
    .bind(&name)
    .execute(pool)
    .await?;

    let id: i64 = sqlx::query_scalar("SELECT id FROM devices WHERE uuid = ?1")
        .bind(&uuid)
        .fetch_one(pool)
        .await?;

    Ok(id)
}

pub async fn ensure_logs_device_id(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let device_id = get_or_create_local_device_id(pool).await?;
    sqlx::query("UPDATE logs SET device_id = ?1 WHERE device_id IS NULL OR device_id <= 0")
        .bind(device_id)
        .execute(pool)
        .await?;
    Ok(device_id)
}

fn local_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .map(|name| name.trim().to_string())
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Unknown Device".to_string())
}
