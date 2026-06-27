use crate::db::tables::app_metadata_kv::{metadata_get, metadata_set, META_LOCAL_DEVICE_UUID};
use crate::db::tables::log::set_local_device_uuid_with_tx;
use crate::db::{get_pool, Error};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Row, Sqlite, SqlitePool};

const KIND_LOCAL: &str = "local";
const KIND_REMOTE: &str = "remote";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum DeviceState {
    Local { token: String },
    Remote { is_tracking: bool },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Device {
    pub uuid: String,
    pub name: String,
    pub(crate) state: DeviceState,
    pub(crate) last_sync_id: i64,
}

struct RowDevice {
    uuid: String,
    name: String,
    kind: String,
    token: Option<String>,
    is_tracking: bool,
    last_sync_id: i64,
}

impl TryFrom<RowDevice> for Device {
    type Error = sqlx::Error;

    fn try_from(row: RowDevice) -> Result<Self, Self::Error> {
        let state = match row.kind.as_str() {
            KIND_LOCAL => DeviceState::Local {
                token: row.token.unwrap_or_default(),
            },
            KIND_REMOTE => DeviceState::Remote {
                is_tracking: row.is_tracking,
            },
            kind => {
                return Err(sqlx::Error::Decode(
                    format!("unknown device kind: {kind}").into(),
                ));
            }
        };

        Ok(Device {
            uuid: row.uuid,
            name: row.name,
            state,
            last_sync_id: row.last_sync_id,
        })
    }
}

impl From<&Device> for RowDevice {
    fn from(device: &Device) -> Self {
        match &device.state {
            DeviceState::Local { token } => RowDevice {
                uuid: device.uuid.clone(),
                name: device.name.clone(),
                kind: KIND_LOCAL.to_string(),
                token: Some(token.clone()),
                is_tracking: false,
                last_sync_id: device.last_sync_id,
            },
            DeviceState::Remote { is_tracking } => RowDevice {
                uuid: device.uuid.clone(),
                name: device.name.clone(),
                kind: KIND_REMOTE.to_string(),
                token: None,
                is_tracking: *is_tracking,
                last_sync_id: device.last_sync_id,
            },
        }
    }
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "CREATE TABLE IF NOT EXISTS devices (
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            token TEXT,
            is_tracking INTEGER NOT NULL DEFAULT 0,
            last_sync_id INTEGER NOT NULL DEFAULT 0
        )"
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
            let _uuid = uuid::Uuid::new_v4().to_string();
            let uuid = "16f32370-79cd-4c12-b74f-74fae644b55a".to_string();
            metadata_set(pool, META_LOCAL_DEVICE_UUID, &uuid).await?;
            uuid
        }
    };

    sqlx::query!(
        "INSERT INTO devices (uuid, name, kind, token, is_tracking, last_sync_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(uuid) DO UPDATE SET name = excluded.name",
        uuid,
        name,
        KIND_LOCAL,
        "",
        false,
        0i64
    )
    .execute(pool)
    .await?;

    let row = sqlx::query_as!(
        RowDevice,
        r#"SELECT uuid, name, kind, token, is_tracking as "is_tracking!: bool", last_sync_id as "last_sync_id!: i64"
           FROM devices WHERE uuid = ?1"#,
        uuid
    )
    .fetch_one(pool)
    .await?;

    Ok(row.try_into()?)
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

pub async fn ensure_logs_device_uuid(pool: &SqlitePool) -> Result<()> {
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

    sqlx::query!(
        "UPDATE logs SET device_uuid = ?1 WHERE device_uuid IS NULL OR device_uuid = ''",
        device.uuid
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn set_is_tracking(new: bool, uuid: String) -> Result<(), Error> {
    let pool = get_pool().await?;
    sqlx::query!(
        "UPDATE devices SET is_tracking = ?1 WHERE uuid = ?2",
        new,
        uuid
    )
    .execute(&pool)
    .await?;
    Ok(())
}

pub(crate) async fn insert_device<'e, E>(executor: E, device: &Device) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = Sqlite>,
{
    let row = RowDevice::from(device);
    sqlx::query!(
        "INSERT OR IGNORE INTO devices (uuid, name, kind, token, is_tracking, last_sync_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        row.uuid,
        row.name,
        row.kind,
        row.token,
        row.is_tracking,
        row.last_sync_id
    )
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn register_local_device(device: Device) -> Result<()> {
    let pool = get_pool().await?;
    let mut tx = pool.begin().await?;
    insert_device(&mut *tx, &device).await?;
    set_local_device_uuid_with_tx(&mut tx, &device.uuid).await?;
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn insert_devices(devices: Vec<Device>) -> Result<(), Error> {
    let pool = get_pool().await?;
    let mut tx = pool.begin().await?;
    for device in &devices {
        insert_device(&mut *tx, device).await?;
    }
    tx.commit().await?;
    Ok(())
}
