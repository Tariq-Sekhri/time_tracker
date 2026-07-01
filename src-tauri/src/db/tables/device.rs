use crate::db::tables::log::{set_local_device_uuid_with_tx, PENDING_LOCAL_DEVICE_UUID};
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
    pub in_cal: bool,
    pub in_stats: bool,
}

impl Device {
    pub fn new(uuid: String, name: String) -> Self {
        Self {
            uuid,
            name,
            state: DeviceState::Remote { is_tracking: false },
            last_sync_id: 0,
            in_cal: true,
            in_stats: true,
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
    in_cal: bool,
    in_stats: bool,
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
            in_cal: row.in_cal,
            in_stats: row.in_stats,
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
                in_cal: device.in_cal,
                in_stats: device.in_stats,
            },
            DeviceState::Remote { is_tracking } => RowDevice {
                uuid: device.uuid.clone(),
                name: device.name.clone(),
                kind: KIND_REMOTE.to_string(),
                token: None,
                is_tracking: *is_tracking,
                last_sync_id: device.last_sync_id,
                in_cal: device.in_cal,
                in_stats: device.in_stats,
            },
        }
    }
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS devices (
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            token TEXT,
            is_tracking INTEGER NOT NULL DEFAULT 0,
            last_sync_id INTEGER NOT NULL DEFAULT 0,
            in_cal INTEGER NOT NULL DEFAULT 1,
            in_stats INTEGER NOT NULL DEFAULT 1
        )",
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

#[derive(Debug, Deserialize)]
pub struct UpdateDevice {
    pub uuid: String,
    pub in_cal: Option<bool>,
    pub in_stats: Option<bool>,
}

#[tauri::command]
pub async fn update_device(update: UpdateDevice) -> Result<(), Error> {
    let pool = get_pool().await?;
    if let Some(in_cal) = update.in_cal {
        sqlx::query("UPDATE devices SET in_cal = ?1 WHERE uuid = ?2")
            .bind(in_cal)
            .bind(&update.uuid)
            .execute(&pool)
            .await?;
    }
    if let Some(in_stats) = update.in_stats {
        sqlx::query("UPDATE devices SET in_stats = ?1 WHERE uuid = ?2")
            .bind(in_stats)
            .bind(&update.uuid)
            .execute(&pool)
            .await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_is_tracking(new: bool, uuid: String) -> Result<(), Error> {
    let pool = get_pool().await?;
    sqlx::query("UPDATE devices SET is_tracking = ?1 WHERE uuid = ?2")
        .bind(new)
        .bind(&uuid)
        .execute(&pool)
        .await?;
    if new {
        sqlx::query("UPDATE devices SET in_cal = 1, in_stats = 1 WHERE uuid = ?1")
            .bind(&uuid)
            .execute(&pool)
            .await?;
    }
    Ok(())
}

pub(crate) async fn insert_device<'e, E>(executor: E, device: &Device) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = Sqlite>,
{
    let row = RowDevice::from(device);
    sqlx::query(
        "INSERT OR IGNORE INTO devices (uuid, name, kind, token, is_tracking, last_sync_id, in_cal, in_stats)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(&row.uuid)
    .bind(&row.name)
    .bind(&row.kind)
    .bind(&row.token)
    .bind(row.is_tracking)
    .bind(row.last_sync_id)
    .bind(row.in_cal)
    .bind(row.in_stats)
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

pub async fn get_local_log_device_uuid() -> Result<Option<String>, Error> {
    if let Some(uuid) = get_local_device_uuid().await? {
        return Ok(Some(uuid));
    }
    let pool = get_pool().await?;
    let has_pending: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM logs WHERE device_uuid = ?1 AND is_deleted = 0 LIMIT 1)",
    )
    .bind(PENDING_LOCAL_DEVICE_UUID)
    .fetch_one(&pool)
    .await?;
    if has_pending {
        Ok(Some(PENDING_LOCAL_DEVICE_UUID.to_string()))
    } else {
        Ok(None)
    }
}

pub async fn set_last_sync_id(uuid: &String, new_last_sync_id: i64) -> Result<(), Error> {
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

pub fn filter_logs_by_devices(
    logs: Vec<crate::db::tables::log::Log>,
    device_uuids: Option<Vec<String>>,
    local_uuid: Option<String>,
) -> Vec<crate::db::tables::log::Log> {
    let Some(uuids) = device_uuids else {
        return logs;
    };
    if uuids.is_empty() {
        return Vec::new();
    }
    let allowed: std::collections::HashSet<String> = uuids.into_iter().collect();
    logs.into_iter()
        .filter(|log| match &log.device_uuid {
            Some(uuid) => {
                allowed.contains(uuid)
                    || (uuid == PENDING_LOCAL_DEVICE_UUID
                        && local_uuid
                            .as_ref()
                            .map(|u| allowed.contains(u))
                            .unwrap_or(true))
            }
            None => local_uuid
                .as_ref()
                .map(|u| allowed.contains(u))
                .unwrap_or(false),
        })
        .collect()
}
