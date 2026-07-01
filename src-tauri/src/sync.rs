use crate::db;
use crate::db::tables::app_metadata_kv::get_server_ip;
use crate::db::tables::device::{
    get_devices as get_devices_from_db, get_local_device, get_local_device_uuid, insert_devices,
    local_device_name, register_local_device, set_last_sync_id, Device, DeviceState,
};
use crate::db::tables::log::{
    consolidate_local_logs_for_reupload, delete_deleted_logs, get_all_local_logs_for_reupload,
    get_deleted_logs, get_local_logs, get_logs_for_sync, insert_logs, Log,
};
use anyhow::{anyhow, Result};
use db::Error;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

fn normalize_server_ip(server_ip: &str) -> String {
    let mut ip = server_ip.trim();
    if let Some(rest) = ip.strip_prefix("http://") {
        ip = rest;
    } else if let Some(rest) = ip.strip_prefix("https://") {
        ip = rest;
    }
    if let Some((host, _)) = ip.split_once('/') {
        ip = host;
    }
    if let Some((host, _)) = ip.split_once(':') {
        ip = host;
    }
    ip.to_string()
}

fn sync_server_url(server_ip: &str, path: &str) -> String {
    let ip = normalize_server_ip(server_ip);
    let path = path.trim_start_matches('/');
    format!("http://{ip}:3000/v1/{path}")
}

#[tauri::command]
pub async fn check(ip: String) -> Result<String, Error> {
    let normalized_ip = normalize_server_ip(&ip);
    let url = sync_server_url(&normalized_ip, "check");
    let res = reqwest::get(&url)
        .await
        .map_err(|e| anyhow!("Failed to reach {url}: {e}"))?;
    if res.status().is_success() {
        let body = res.text().await?.trim().to_string();
        if body == "Time Tracker Backend v1" {
            Ok(normalized_ip)
        } else {
            Err(anyhow!("Server backend returned wrong string from {url}: {body}").into())
        }
    } else {
        Err(anyhow!("Server returned error from {url}: {}", res.status()).into())
    }
}
#[derive(Debug, Deserialize, Serialize)]
struct RegisterResponse {
    uuid: String,
    token: String,
}
#[tauri::command]
pub async fn register() -> Result<(), Error> {
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    check(server_ip.clone()).await?;
    // post
    let name = local_device_name();

    let body = json!({
        "name": name
    });

    let res = reqwest::Client::new()
        .post(sync_server_url(&server_ip, "register"))
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<RegisterResponse>()
        .await?;
    let device = Device {
        name,
        uuid: res.uuid.clone(),
        state: DeviceState::Local { token: res.token },
        last_sync_id: -1,
        in_cal: true,
        in_stats: true,
    };
    register_local_device(device).await?;
    Ok(())
}

async fn post_logs_to_server(
    logs: Vec<Log>,
    token: String,
    server_ip: String,
    device_uuid: String,
) -> Result<usize, Error> {
    let count = logs.len();
    if count == 0 {
        return Ok(0);
    }
    let body = json!({
        "token": token,
        "logs": logs,
    });
    let res = reqwest::Client::new()
        .post(sync_server_url(&server_ip, "upload_all_logs"))
        .json(&body)
        .send()
        .await?
        .error_for_status()?;
    if res.status().is_success() {
        if let Some(max) = logs.iter().map(|log| log.id).max() {
            set_last_sync_id(&device_uuid, max).await?;
        }
    }
    Ok(count)
}

#[tauri::command]
pub async fn upload_all_logs() -> Result<usize, Error> {
    let logs = get_local_logs().await?;
    if logs.is_empty() {
        return Ok(0);
    }
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let device = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not found"))?;
    let token = match device.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::from(anyhow!("somehow got remote device?")));
        }
    };
    post_logs_to_server(logs, token, server_ip, device.uuid).await
}

#[tauri::command]
pub async fn reupload_all_logs() -> Result<usize, Error> {
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let device = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not found"))?;
    let token = match device.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::from(anyhow!("somehow got remote device?")));
        }
    };
    consolidate_local_logs_for_reupload(&device.uuid).await?;
    set_last_sync_id(&device.uuid, -1).await?;
    let logs = get_all_local_logs_for_reupload(&device.uuid).await?;
    post_logs_to_server(logs, token, server_ip, device.uuid).await
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
        DeviceState::Remote { .. } => {
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
        .post(sync_server_url(&server_ip, "upload_all_logs"))
        .json(&body)
        .send()
        .await?;
    if res.status().is_success() {
        delete_deleted_logs().await?;
        if let Some(max) = logs.iter().map(|log| log.id).max() {
            let uuid = get_local_device_uuid().await?.unwrap();
            set_last_sync_id(&uuid, max).await?;
        }
    }

    Ok(())
}

#[derive(Debug, Deserialize, Serialize)]
struct ServerDevice {
    name: String,
    uuid: String,
    last_sync_id: i64,
}

#[derive(Debug, Deserialize)]
struct ServerLog {
    id: i64,
    device_uuid: Option<String>,
    app: String,
    timestamp: i64,
    duration: i64,
}

impl From<ServerLog> for Log {
    fn from(log: ServerLog) -> Self {
        Log {
            id: log.id,
            device_uuid: log.device_uuid,
            app: log.app,
            timestamp: log.timestamp,
            duration: log.duration,
            is_deleted: false,
        }
    }
}

#[tauri::command]
pub async fn get_devices() -> Result<Vec<Device>, Error> {
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let devices: Vec<Device> = reqwest::get(sync_server_url(&server_ip, "devices"))
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
pub async fn device_logs(device_uuid: Option<String>) -> Result<usize, Error> {
    let mut devices: Vec<Device> = get_devices()
        .await?
        .into_iter()
        .filter(|device| match device.state {
            DeviceState::Local { .. } => false,
            DeviceState::Remote { is_tracking } => is_tracking,
        })
        .collect();

    if let Some(uuid) = &device_uuid {
        devices.retain(|device| &device.uuid == uuid);
    }

    if devices.is_empty() {
        return Ok(0);
    }

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
        .get(sync_server_url(&server_ip, "devices/"))
        .json(&de)
        .send()
        .await?
        .error_for_status()?;

    let logs: Vec<Log> = res
        .json::<Vec<ServerLog>>()
        .await?
        .into_iter()
        .map(Log::from)
        .collect();
    insert_logs(&logs).await?;

    let count = if let Some(uuid) = device_uuid {
        logs.iter()
            .filter(|log| log.device_uuid.as_deref() == Some(uuid.as_str()))
            .count()
    } else {
        logs.len()
    };

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

    Ok(count)
}
