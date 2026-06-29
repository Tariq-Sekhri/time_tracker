use crate::db::tables::log::set_local_device_uuid_with_tx;
use crate::db::{get_pool, Error};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Row, Sqlite, SqlitePool};

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

impl Device {
    pub fn new(uuid: String, name: String) -> Self {
        Self {
            uuid,
            name,
            state: DeviceState::Remote { is_tracking: false },
            last_sync_id: 0,
        }
    }
}

#[derive(FromRow)]
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

pub fn local_device_name() -> String {
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
    for device in devices {
        insert_device(&mut *tx, &device).await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn get_local_device() -> std::result::Result<Option<Device>, Error> {
    let pool = get_pool().await?;
    let device = sqlx::query_as::<_, RowDevice>("SELECT * FROM devices where token not null")
        .fetch_optional(&pool)
        .await?;
    let ret: Option<Device> = match device {
        Some(device) => Some(device.try_into()?),
        None => None,
    };
    Ok(ret)
}

pub async fn get_local_device_uuid() -> Result<Option<String>, Error> {
    let local = get_local_device().await?;
    if let Some(local) = local {
        Ok(Some(local.uuid))
    } else {
        Ok(None)
    }
}

pub async fn set_last_sync_id(uuid: &Option<String>, new_last_sync_id: i64) -> Result<(), Error> {
    let pool = get_pool().await?;
    sqlx::query("UPDATE devices SET last_sync_id = ? WHERE uuid = ?")
        .bind(new_last_sync_id)
        .bind(uuid)
        .execute(&pool)
        .await?;
    Ok(())
}

pub async fn get_devices() -> Result<Vec<Device>, Error> {
    let pool = get_pool().await?;

    let devices = sqlx::query_as::<_, RowDevice>("SELECT * FROM devices")
        .fetch_all(&pool)
        .await?
        .into_iter()
        .map(Device::try_from)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(devices)
}
