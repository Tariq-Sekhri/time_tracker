use crate::app_prefs::{get_app_metadata, set_app_metadata};
use crate::db;
use crate::db::get_pool;
use crate::db::tables::app_metadata_kv::get_server_ip;
use crate::db::tables::device::{get_or_create_local_device, insert_devices, Device, DeviceState};
use crate::db::tables::log::{get_logs, set_local_uuid, Log};
use anyhow::{anyhow, Result};
use db::Error;
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const DEFAULT_SERVER_IP: &str = "100.75.95.90";

fn local_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .map(|name| name.trim().to_string())
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Unknown Device".to_string())
}

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
#[derive(Debug, Deserialize)]
struct RegisterResponse {
    uuid: String,
    token: String,
}
#[tauri::command]
pub async fn register() -> Result<()> {
    check().await?;
    // post
    let name = local_device_name();

    let body = serde_json::json!({
        "name": name
    });

    let res = reqwest::Client::new()
        .post("http://127.0.0.1:3000/v1/register")
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<RegisterResponse>()
        .await?;
    let uuid = res.uuid.clone();
    let device = Device {
        name,
        uuid: res.uuid,
        state: DeviceState::Local { token: res.token },
        last_sync_id: 0,
    };
    insert_devices(vec![device]).await?;
    set_local_uuid(uuid).await?;
    Ok(())
}
#[tauri::command]
pub async fn upload_all_logs() -> bool {
    //post
    //get local device
    // get all logs
    // post
    //lat sync id update
    todo!()
}

#[tauri::command]
pub async fn sync() -> Result<()> {
    // get logs  remove latest log
    // post
    // device token, logs, deleted logs

    Ok(())
}
#[tauri::command]
pub async fn devices() -> Result<Vec<Device>> {
    // get from server
    //  add new
    // return all
    todo!()
}
#[tauri::command]
pub async fn device_logs() -> Result<()> {
    ///devices/{device_uuid}"
    // get devices
    // for each device where is tracking then get all logs
    // once we have a Vec<logs>
    // insert the new logs
    // set last sync id
    Ok(())
}
