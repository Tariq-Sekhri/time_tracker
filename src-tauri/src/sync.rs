use crate::db;
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

#[tauri::command]
pub async fn push_all_logs() -> Result<(), Error> {
    let logs: Vec<Log> = get_logs().await?;
    // .take(10)
    // .collect();

    let device = get_or_create_local_device().await?;
    let body = PushLogBody { device, logs };
    // let server_ip= get_app_metadata("server_ip".to_string()).await?;
    let ip = "100.75.95.90";
    let url = format!("http://{}:3000/v1/upload_logs", ip);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let res = client
        .post(url)
        .json(&body)
        .send()
        .await?
        .error_for_status()?;

    Ok(())
}
#[tauri::command]
pub async fn get_devices() -> Result<Vec<Device>, Error> {
    let ip = "100.75.95.90";
    let url = format!("http://{}:3000/v1/devices", ip);
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
    println!("{:#?}", devices);
    Ok(devices)
}
