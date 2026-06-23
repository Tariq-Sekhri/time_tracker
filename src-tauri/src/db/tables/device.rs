use crate::db::tables::app_metadata_kv::{metadata_get, metadata_set, META_LOCAL_DEVICE_UUID};
use crate::db::{get_pool, Error};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct Device {
    pub uuid: String,
    pub name: String,
    #[serde(default)]
    pub is_tracking: bool,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS devices (
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            is_tracking INTEGER NOT NULL DEFAULT 0
        )",
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_or_create_local_device() -> Result<Device, sqlx::Error> {
    let pool = &get_pool().await?;
    get_or_create_local_device_with_pool(pool).await
}

async fn get_or_create_local_device_with_pool(pool: &SqlitePool) -> Result<Device, sqlx::Error> {
    create_table(pool).await?;

    let name = local_device_name();
    let uuid = match metadata_get(pool, META_LOCAL_DEVICE_UUID).await? {
        Some(uuid) if uuid::Uuid::parse_str(uuid.trim()).is_ok() => uuid.trim().to_string(),

        _ => {
            let uuid = uuid::Uuid::new_v4().to_string();
            let uuid = "16f32370-79cd-4c12-b74f-74fae644b55a".to_string();
            metadata_set(pool, META_LOCAL_DEVICE_UUID, &uuid).await?;
            uuid
        }
    };

    sqlx::query(
        "INSERT INTO devices (uuid, name, is_tracking)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(uuid) DO UPDATE SET name = excluded.name",
    )
    .bind(&uuid)
    .bind(&name)
    .bind(true)
    .execute(pool)
    .await?;

    let device: Device = sqlx::query_as("SELECT * FROM devices WHERE uuid = ?1")
        .bind(&uuid)
        .fetch_one(pool)
        .await?;

    Ok(device)
}

fn local_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .map(|name| name.trim().to_string())
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Unknown Device".to_string())
}

async fn column_exists(
    pool: &SqlitePool,
    table_name: &str,
    column_name: &str,
) -> Result<bool, sqlx::Error> {
    let query = format!("PRAGMA table_info({})", table_name);
    let rows = sqlx::query(sqlx::AssertSqlSafe(query))
        .fetch_all(pool)
        .await?;

    Ok(rows
        .iter()
        .any(|row| row.try_get::<String, _>(1).ok().as_deref() == Some(column_name)))
}

pub async fn ensure_logs_device_uuid(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let device = get_or_create_local_device_with_pool(pool).await?;

    if column_exists(pool, "logs", "device_id").await? {
        sqlx::query(
            r#"UPDATE logs SET device_uuid = (
                SELECT d.uuid FROM devices d WHERE d.id = logs.device_id
            )
            WHERE (device_uuid IS NULL OR device_uuid = '')
              AND device_id != 0
              AND EXISTS (SELECT 1 FROM devices d WHERE d.id = logs.device_id)"#,
        )
        .execute(pool)
        .await?;
    }

    sqlx::query("UPDATE logs SET device_uuid = ?1 WHERE device_uuid IS NULL OR device_uuid = ''")
        .bind(&device.uuid)
        .execute(pool)
        .await?;

    Ok(())
}

#[tauri::command]
pub async fn set_is_tracking(new: bool, uuid: String) -> Result<(), Error> {
    let pool = get_pool().await?;
    sqlx::query("UPDATE devices SET is_tracking = ?1 WHERE uuid = ?2")
        .bind(new)
        .bind(uuid)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn insert_devices(devices: Vec<Device>) -> Result<(), Error> {
    let pool = get_pool().await?;
    let mut tx = pool.begin().await?;
    for device in &devices {
        sqlx::query(
            "INSERT OR IGNORE INTO devices (uuid, name, is_tracking) VALUES (?1, ?2, ?3)",
        )
        .bind(&device.uuid)
        .bind(&device.name)
        .bind(device.is_tracking)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
