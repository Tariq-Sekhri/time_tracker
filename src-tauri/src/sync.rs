use crate::db;
use crate::db::tables::device::get_or_create_local_device;
use crate::db::tables::log::get_logs;
use db::Error;
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize, Debug)]
struct logs {
    pub id: i64,
    pub app: String,
    pub timestamp: i64,
    pub duration: i64,
}
#[derive(Serialize, Debug)]
struct device {
    pub uuid: String,
    pub name: String,
}
#[derive(Serialize, Debug)]
struct PushLogBody {
    device: device,
    logs: Vec<logs>,
}

#[tauri::command]
pub async fn push_all_logs() -> Result<(), Error> {
    let logs: Vec<logs> = get_logs()
        .await?
        .iter()
        .map(|log| logs {
            id: log.id,
            app: log.app.clone(),
            timestamp: log.timestamp,
            duration: log.duration,
        })
        // .take(10)
        .collect();

    let device = get_or_create_local_device().await?;
    let push_device = device {
        uuid: device.uuid.clone(),
        name: device.name.clone(),
    };
    let body = PushLogBody {
        device: push_device,
        logs,
    };
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
