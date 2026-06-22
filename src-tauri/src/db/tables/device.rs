use crate::db::get_pool;
use crate::db::tables::app_metadata_kv::{metadata_get, metadata_set};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, SqlitePool};

const META_LOCAL_DEVICE_UUID: &str = "local_device_uuid_v1";

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct Device {
    pub uuid: String,
    pub name: String,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS devices (
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL
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

    sqlx::query(
        "UPDATE logs SET device_uuid = ?1 WHERE device_uuid IS NULL OR device_uuid = ''",
    )
    .bind(&device.uuid)
    .execute(pool)
    .await?;

    Ok(())
}
