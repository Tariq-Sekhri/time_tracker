use crate::db;
use crate::db::get_pool;
use crate::db::tables::app_metadata_kv::{get_server_ip, set_server_ip};
use crate::db::tables::device::{get_or_create_local_device, Device};
use crate::db::tables::log::{get_logs, Log};
use db::Error;
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize, Debug)]
struct PushLogBody {
    device: Device,
    logs: Vec<Log>,
}

async fn require_server_ip() -> Result<String, Error> {
    let pool = get_pool().await?;
    get_server_ip(&pool)
        .await?
        .filter(|ip| !ip.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("Server IP not configured").into())
}

#[tauri::command]
pub async fn get_local_device() -> Result<Device, Error> {
    Ok(get_or_create_local_device().await?)
}

#[tauri::command]
pub async fn get_sync_server_ip() -> Result<Option<String>, Error> {
    let pool = get_pool().await?;
    Ok(get_server_ip(&pool).await?)
}

#[tauri::command]
pub async fn set_sync_server_ip(ip: String) -> Result<(), Error> {
    let pool = get_pool().await?;
    set_server_ip(&pool, &ip).await?;
    Ok(())
}

#[tauri::command]
pub async fn push_all_logs() -> Result<(), Error> {
    let logs: Vec<Log> = get_logs().await?;
    let device = get_or_create_local_device().await?;
    let body = PushLogBody { device, logs };
    let ip = require_server_ip().await?;
    let url = format!("http://{}:3000/v1/upload_logs", ip.trim());
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    client
        .post(url)
        .json(&body)
        .send()
        .await?
        .error_for_status()?;

    Ok(())
}

#[tauri::command]
pub async fn get_devices() -> Result<Vec<Device>, Error> {
    let ip = require_server_ip().await?;
    let url = format!("http://{}:3000/v1/devices", ip.trim());
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let devices = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<Device>>()
        .await?;
    Ok(devices)
}
