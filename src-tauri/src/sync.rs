use crate::app_prefs::{get_app_metadata, set_app_metadata};
use crate::db;
use crate::db::get_pool;
use crate::db::tables::app_metadata_kv::get_server_ip;
use crate::db::tables::device::{
    get_devices as get_devices_from_db, get_local_device, get_local_device_uuid, insert_devices,
    local_device_name, register_local_device, set_last_sync_id, Device, DeviceState,
};
use crate::db::tables::log::{
    delete_deleted_logs, get_deleted_logs, get_local_logs, get_logs, get_logs_for_sync,
    insert_logs, Log,
};
use anyhow::{anyhow, Result};
use db::Error;
use reqwest::Response;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::try_join;

pub const DEFAULT_SERVER_IP: &str = "100.75.95.90";

#[tauri::command]
pub async fn check() -> Result<()> {
    let ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let url = format!("http://{}:3000/v1/check", ip);
    let res = reqwest::get(url).await?;
    if res.status().is_success() {
        if res.text().await? == "Time Tracker Backend v1" {
            Ok(())
        } else {
            Err(anyhow!("Server backend returned wrong string"))
        }
    } else {
        Err(anyhow!("Server returned error"))
    }
}
#[derive(Debug, Deserialize, Serialize)]
struct RegisterResponse {
    uuid: String,
    token: String,
}
#[tauri::command]
pub async fn register() -> Result<()> {
    check().await?;
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    // post
    let name = local_device_name();

    let body = serde_json::json!({
        "name": name
    });

    let res = reqwest::Client::new()
        .post(format!("http://{}:3000/v1/register", server_ip))
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<RegisterResponse>()
        .await?;
    let device = Device {
        name,
        uuid: res.uuid,
        state: DeviceState::Local { token: res.token },
        last_sync_id: -1,
    };
    register_local_device(device).await?;
    Ok(())
}
#[tauri::command]
pub async fn upload_all_logs() -> Result<(), Error> {
    let logs = get_local_logs().await?;
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;

    let res = reqwest::Client::new()
        .post(format!("http://{}:3000/v1/upload_all_logs", server_ip))
        .json(&logs)
        .send()
        .await?
        .error_for_status()?;
    if res.status().is_success() {
        let max = logs
            .iter()
            .max()
            .ok_or(anyhow!("could not get server ip"))?
            .id;
        let uuid = get_local_device_uuid().await?.unwrap();
        set_last_sync_id(&uuid, max).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn sync() -> Result<(), Error> {
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let logs = get_logs_for_sync().await?;
    let device = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not found"))?;
    let token = match device.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { is_tracking } => {
            return Err(Error::from(anyhow!("somehow got remote device?")));
        }
    };
    let deleted_ids: Vec<i64> = get_deleted_logs()
        .await?
        .into_iter()
        .map(|logs| logs.id)
        .collect();

    let body = serde_json::json!({
        "logs": logs,
        "token":token,
        "deleted_ids": deleted_ids,
    });
    let res = reqwest::Client::new()
        .post(format!("http://{}:3000/v1/upload_all_logs", server_ip))
        .json(&body)
        .send()
        .await?;
    if res.status().is_success() {
        delete_deleted_logs().await?;
        let max = logs
            .iter()
            .max()
            .ok_or(anyhow!("could not get server ip"))?
            .id;
        let uuid = get_local_device_uuid().await?.unwrap();
        set_last_sync_id(&uuid, max).await?;
    }

    Ok(())
}
#[derive(Debug, Deserialize, Serialize)]
struct ServerDevice {
    name: String,
    uuid: String,
    last_sync_id: i64,
}

#[tauri::command]
pub async fn get_devices() -> Result<Vec<Device>, Error> {
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let devices: Vec<Device> = reqwest::get(format!("http://{}:3000/v1/devices", server_ip))
        .await?
        .error_for_status()?
        .json::<Vec<ServerDevice>>()
        .await?
        .into_iter()
        .map(|device| Device::new(device.uuid, device.name))
        .collect();

    insert_devices(devices).await?;
    get_devices_from_db().await
}
#[tauri::command]
pub async fn device_logs() -> Result<(), Error> {
    let devices: Vec<Device> = get_devices()
        .await?
        .into_iter()
        .filter(|device| match device.state {
            DeviceState::Local { .. } => false,
            DeviceState::Remote { is_tracking } => is_tracking,
        })
        .collect();

    //devices/{device_uuid}"
    let de = devices
        .iter()
        .map(|device| ServerDevice {
            name: device.name.clone(),
            uuid: device.uuid.clone(),
            last_sync_id: device.last_sync_id,
        })
        .collect::<Vec<ServerDevice>>();
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let res = reqwest::Client::new()
        .get(format!("http://{}:3000/v1/device_logs", server_ip))
        .json(&de)
        .send()
        .await?
        .error_for_status()?;

    // insert the new logs
    let logs = res.json::<Vec<Log>>().await?;
    insert_logs(&logs).await?;

    let mut max_id_by_device: HashMap<String, i64> = HashMap::new();
    for log in &logs {
        if let Some(uuid) = &log.device_uuid {
            max_id_by_device
                .entry(uuid.clone())
                .and_modify(|max| *max = (*max).max(log.id))
                .or_insert(log.id);
        }
    }
    for device in &devices {
        if let Some(&max_id) = max_id_by_device.get(&device.uuid) {
            set_last_sync_id(&device.uuid, max_id).await?;
        }
    }

    Ok(())
}
