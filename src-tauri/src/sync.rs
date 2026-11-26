use crate::db;
use crate::db::tables::app_metadata_kv::{get_server_ip, metadata_get, SERVER_IP};
use crate::db::tables::device::{
    device_has_logs, get_devices as get_devices_from_db, get_local_device, get_local_device_uuid,
    insert_devices, invalidate_local_device_registration, register_local_device, set_last_sync_id,
    set_local_device_active, unsubscribe_remote_device, untrack_remote_devices_not_on_server,
    release_local_device, Device, DeviceRole, DeviceState,
};
use crate::db::tables::log::{
    consolidate_local_logs_for_reupload, delete_local_deleted_logs,
    get_all_local_logs_for_reupload, get_local_deleted_logs, get_local_logs, get_logs_for_sync,
    insert_logs, Log,
};
use anyhow::{anyhow, Result};
use db::Error;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex as AsyncMutex, Notify};

pub const SYNC_INTERVAL_SECS: u64 = 60;

const SERVER_ID: &str = "sync_server_id";
static IS_CONSUMER: AtomicBool = AtomicBool::new(false);

pub(crate) fn is_consumer() -> bool {
    IS_CONSUMER.load(Ordering::Acquire)
}

#[tauri::command]
pub fn sync_device_role() -> DeviceRole {
    if is_consumer() { DeviceRole::Consumer } else { DeviceRole::Logger }
}

pub(crate) async fn load_device_role() -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let role = metadata_get(&pool, "sync_device_role").await?;
    IS_CONSUMER.store(role.as_deref() == Some("consumer"), Ordering::Release);
    Ok(())
}

static SYNC_COUNTDOWN_RESET: OnceLock<Arc<Notify>> = OnceLock::new();
static SYNC_COUNTDOWN_REMAINING: AtomicI64 = AtomicI64::new(-1);
static SYNC_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static SYNC_CYCLE_LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();

fn ensure_sync_enabled() -> Result<(), Error> {
    if !crate::instance::SYNC_ENABLED {
        return Err(anyhow!("Sync is disabled in dev and beta builds").into());
    }
    Ok(())
}

pub(crate) fn sync_http_client() -> Result<&'static reqwest::Client, Error> {
    ensure_sync_enabled()?;
    Ok(SYNC_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(30))
            .build()
            .expect("sync HTTP client configuration is valid")
    }))
}

fn sync_cycle_lock() -> &'static AsyncMutex<()> {
    SYNC_CYCLE_LOCK.get_or_init(|| AsyncMutex::new(()))
}

pub fn set_sync_countdown_remaining(secs: i64) {
    SYNC_COUNTDOWN_REMAINING.store(secs, Ordering::Relaxed);
}

pub fn get_sync_countdown_remaining() -> Option<i64> {
    let secs = SYNC_COUNTDOWN_REMAINING.load(Ordering::Relaxed);
    if secs >= 0 {
        Some(secs)
    } else {
        None
    }
}

pub fn sync_countdown_reset_notify() -> Arc<Notify> {
    SYNC_COUNTDOWN_RESET
        .get_or_init(|| Arc::new(Notify::new()))
        .clone()
}

pub fn request_sync_countdown_reset() {
    sync_countdown_reset_notify().notify_waiters();
}

fn normalize_server_address(address: &str) -> Result<url::Url> {
    let address = address.trim();
    anyhow::ensure!(
        !address.is_empty() && !address.contains(['\\', '@']),
        "Enter a server address without credentials"
    );
    let has_scheme = address.contains("://");
    let candidate = if has_scheme { address.to_owned() } else { format!("http://{address}") };
    let mut url = url::Url::parse(&candidate)?;
    anyhow::ensure!(
        matches!(url.scheme(), "http" | "https")
            && url.host().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.path() == "/",
        "Enter an HTTP or HTTPS server address, optionally with a port"
    );
    let authority = address.trim_end_matches('/');
    let bare_host = !has_scheme && if authority.starts_with('[') {
        authority.ends_with(']')
    } else {
        !authority.contains(':')
    };
    if bare_host {
        url.set_port(Some(8765)).map_err(|_| anyhow!("Invalid server port"))?;
    }
    Ok(url)
}

pub(crate) fn sync_server_url(server: &str, path: &str) -> Result<String, Error> {
    let base = normalize_server_address(server)?;
    Ok(format!("{}v1/{}", base, path.trim_start_matches('/')))
}

#[derive(Deserialize)]
struct ServerInfo {
    id: String,
    device_roles: bool,
}

async fn server_info(server: &str) -> Result<Option<ServerInfo>, Error> {
    let response = sync_http_client()?.get(sync_server_url(server, "info")?).send().await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    Ok(Some(response.error_for_status()?.json().await?))
}

pub(crate) async fn connect_server(address: &str) -> Result<(), Error> {
    let _lock = sync_cycle_lock().lock().await;
    let address = check(address.to_owned()).await?;
    let info = server_info(&address).await?;
    let pool = db::get_pool().await?;
    let old_address = metadata_get(&pool, SERVER_IP).await?
        .and_then(|old| normalize_server_address(&old).ok())
        .map(|url| url.to_string());
    let old_id = metadata_get(&pool, SERVER_ID).await?;
    let new_id = info.map(|info| info.id);
    let same_server = match (&old_id, &new_id) {
        (Some(old), Some(new)) => old == new,
        (None, _) | (_, None) => old_address.as_deref() == Some(address.as_str()),
    };
    let local = get_local_device().await?;
    let mut tx = pool.begin().await?;
    if !same_server {
        if let Some(device) = local {
            release_local_device(&mut tx, &device.uuid).await?;
        }
        sqlx::query("UPDATE devices SET is_tracking = 0 WHERE kind = 'remote'")
            .execute(&mut *tx).await?;
        sqlx::query("DELETE FROM app_metadata WHERE key = 'manual_entries_cursor_v1'")
            .execute(&mut *tx).await?;
    }
    sqlx::query("INSERT OR REPLACE INTO app_metadata(key,value) VALUES (?,?)")
        .bind(SERVER_IP).bind(&address).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM app_metadata WHERE key = ?")
        .bind(SERVER_ID).execute(&mut *tx).await?;
    if let Some(id) = new_id {
        sqlx::query("INSERT INTO app_metadata(key,value) VALUES (?,?)")
            .bind(SERVER_ID).bind(id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    crate::manual_sync::connection_changed();
    request_sync_countdown_reset();
    Ok(())
}

#[tauri::command]
pub async fn check(ip: String) -> Result<String, Error> {
    ensure_sync_enabled()?;
    let normalized_ip = normalize_server_address(&ip)?.to_string();
    let url = sync_server_url(&normalized_ip, "check")?;
    let res = sync_http_client()?
        .get(&url)
        .send()
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

pub(crate) async fn require_authenticated_success(
    response: reqwest::Response,
    device_uuid: &str,
) -> Result<reqwest::Response, Error> {
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        invalidate_local_device_registration(device_uuid).await?;
        return Err(Error::new(anyhow!(
            "This device is no longer registered on the sync server. Register it again to resume syncing."
        )));
    }
    if response.status() == reqwest::StatusCode::FORBIDDEN {
        set_local_device_active(device_uuid, false).await?;
        return Err(Error::new(anyhow!(
            "This device is waiting for admin approval."
        )));
    }
    Ok(response.error_for_status()?)
}
#[derive(Debug, Deserialize, Serialize)]
struct RegisterResponse {
    uuid: String,
    token: String,
    is_active: bool,
    #[serde(default)]
    role: DeviceRole,
}
#[tauri::command]
pub async fn register(name: String, role: Option<DeviceRole>) -> Result<(), Error> {
    ensure_sync_enabled()?;
    let _lock = sync_cycle_lock().lock().await;
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server address not set"))?;
    if get_local_device().await?.is_some() {
        return Err(anyhow!("This device is already registered").into());
    }
    let role = role.unwrap_or(if is_consumer() { DeviceRole::Consumer } else { DeviceRole::Logger });
    if role == DeviceRole::Integration {
        return Err(anyhow!("Choose a logger or consumer device").into());
    }
    if role == DeviceRole::Consumer
        && !server_info(&server_ip).await?.is_some_and(|info| info.device_roles)
    {
        return Err(anyhow!("Update the sync server before connecting a consumer device").into());
    }
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(Error::new(anyhow!("Device name cannot be empty")));
    }
    let body = json!({
        "name": name,
        "role": role
    });

    let res = sync_http_client()?
        .post(sync_server_url(&server_ip, "register")?)
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<RegisterResponse>()
        .await?;
    if res.role != role {
        return Err(anyhow!("The server did not assign the requested device role").into());
    }
    let device = Device {
        name,
        role,
        uuid: res.uuid.clone(),
        state: DeviceState::Local { token: res.token },
        last_sync_id: if role == DeviceRole::Consumer { 0 } else { -1 },
        is_active: res.is_active,
        in_cal: true,
        in_stats: true,
        available_on_server: true,
        has_local_logs: false,
    };
    register_local_device(device).await?;
    IS_CONSUMER.store(role == DeviceRole::Consumer, Ordering::Release);
    Ok(())
}

async fn post_logs_to_server(
    logs: Vec<Log>,
    token: String,
    server_ip: String,
    device_uuid: String,
) -> Result<usize, Error> {
    ensure_sync_enabled()?;
    let count = logs.len();
    if count == 0 {
        return Ok(0);
    }
    let body = json!({
        "token": token,
        "logs": logs,
    });
    let res = sync_http_client()?
        .post(sync_server_url(&server_ip, "upload_all_logs")?)
        .json(&body)
        .send()
        .await?;
    require_authenticated_success(res, &device_uuid).await?;
    if let Some(max) = logs.iter().map(|log| log.id).max() {
        set_last_sync_id(&device_uuid, max).await?;
    }
    Ok(count)
}

async fn upload_afk_evidence(device: &str, token: &str, server_ip: &str, all: bool) -> Result<(), Error> {
    ensure_sync_enabled()?;
    let pool = db::get_pool().await?;
    let through = crate::afk::sync::latest_local_id(&pool, device).await?;
    let mut cursor = if all { 0 } else { crate::afk::sync::upload_cursor(&pool, device).await? };
    loop {
        let page = crate::afk::sync::upload_page(&pool, device, cursor, through).await?;
        let Some(last) = page.last().map(|e| e.id) else { break; };
        let response = sync_http_client()?.post(sync_server_url(server_ip, "afk")?)
            .bearer_auth(token).json(&page).send().await?;
        require_afk_success(response, device).await?;
        crate::afk::sync::acknowledge_upload(&pool, device, last).await?;
        if last >= through { break; }
        cursor = last;
    }
    Ok(())
}

async fn require_afk_success(response: reqwest::Response, device: &str) -> Result<reqwest::Response, Error> {
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(anyhow!("AFK sync is unavailable. Update the Time Tracker server to support AFK evidence.").into());
    }
    require_authenticated_success(response, device).await
}

async fn download_afk_evidence(device: &str, local: &str, token: &str, server_ip: &str) -> Result<(), Error> {
    ensure_sync_enabled()?;
    let pool = db::get_pool().await?;
    let mut cursor = crate::afk::sync::download_cursor(&pool, device).await?;
    loop {
        let response = sync_http_client()?.get(sync_server_url(server_ip, &format!("afk/{device}"))?)
            .bearer_auth(token).query(&[("after",cursor)]).send().await?;
        let page: Vec<crate::afk::sync::Evidence> = require_afk_success(response, local).await?.json().await?;
        if page.is_empty() { break; }
        if page.len() > crate::afk::sync::PAGE_SIZE || page.iter().any(|e| e.revision <= cursor)
            || page.windows(2).any(|p| p[0].revision >= p[1].revision) {
            return Err(anyhow!("Invalid AFK sync page ordering").into());
        }
        crate::afk::sync::import_page(&pool, device, &page).await?;
        cursor = page.last().unwrap().revision;
        if page.len() < crate::afk::sync::PAGE_SIZE { break; }
    }
    Ok(())
}

#[tauri::command]
pub async fn upload_all_logs() -> Result<usize, Error> {
    let _lock = sync_cycle_lock().lock().await;
    ensure_sync_enabled()?;
    if is_consumer() {
        return Err(anyhow!("Consumer devices cannot upload activity").into());
    }
    crate::logger::Log::info("Initial sync upload started");
    let mut perf = crate::perf::Perf::new("upload_all_logs");
    let device = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not found"))?;
    if !device.is_active {
        return Err(Error::new(anyhow!("Device is waiting for admin approval")));
    }
    let logs = get_local_logs().await?;
    perf.stage("load_logs");
    perf.note("logs", logs.len());
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let token = match device.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::from(anyhow!("somehow got remote device?")));
        }
    };
    let count = post_logs_to_server(logs, token.clone(), server_ip.clone(), device.uuid.clone()).await?;
    if count == 0 { set_last_sync_id(&device.uuid, 0).await?; }
    upload_afk_evidence(&device.uuid, &token, &server_ip, true).await?;
    perf.stage("upload");
    perf.done();
    Ok(count)
}

#[tauri::command]
pub async fn reupload_all_logs() -> Result<usize, Error> {
    let _lock = sync_cycle_lock().lock().await;
    ensure_sync_enabled()?;
    if is_consumer() {
        return Err(anyhow!("Consumer devices cannot upload activity").into());
    }
    crate::logger::Log::info("Full sync reupload started");
    let mut perf = crate::perf::Perf::new("reupload_all_logs");
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let device = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not found"))?;
    if !device.is_active {
        return Err(Error::new(anyhow!("Device is waiting for admin approval")));
    }
    let token = match device.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::from(anyhow!("somehow got remote device?")));
        }
    };
    perf.stage("setup");
    consolidate_local_logs_for_reupload(&device.uuid).await?;
    perf.stage("consolidate");
    let logs = get_all_local_logs_for_reupload(&device.uuid).await?;
    perf.stage("load_logs");
    perf.note("logs", logs.len());
    let count = post_logs_to_server(logs, token.clone(), server_ip.clone(), device.uuid.clone()).await?;
    upload_afk_evidence(&device.uuid, &token, &server_ip, true).await?;
    perf.stage("upload");
    perf.done();
    if count == 0 {
        set_last_sync_id(&device.uuid, 0).await?;
    }
    request_sync_countdown_reset();
    Ok(count)
}

pub async fn is_registered_for_sync() -> Result<bool, Error> {
    Ok(get_local_device().await?.is_some())
}

pub async fn is_sync_ready() -> Result<bool, Error> {
    if !crate::instance::SYNC_ENABLED {return Ok(false);}
    let Some(device) = get_local_device().await? else {
        return Ok(false);
    };
    Ok(device.is_active && device.last_sync_id != -1)
}

#[derive(Debug, Deserialize)]
struct DeviceStatusResponse {
    uuid: String,
    is_active: bool,
}

#[tauri::command]
pub async fn check_device_activation() -> Result<bool, Error> {
    let _lock = sync_cycle_lock().lock().await;
    ensure_sync_enabled()?;
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let device = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not found"))?;
    let token = match &device.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::new(anyhow!("Local device state is invalid")))
        }
    };
    let response = sync_http_client()?
        .post(sync_server_url(&server_ip, "status")?)
        .json(&json!({ "token": token }))
        .send()
        .await?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        invalidate_local_device_registration(&device.uuid).await?;
        return Err(Error::new(anyhow!(
            "This registration was removed from the server. Register the device again."
        )));
    }
    let status = response
        .error_for_status()?
        .json::<DeviceStatusResponse>()
        .await?;
    if status.uuid != device.uuid {
        return Err(Error::new(anyhow!(
            "Server returned status for a different device"
        )));
    }
    set_local_device_active(&device.uuid, status.is_active).await?;
    if status.is_active {
        request_sync_countdown_reset();
    }
    Ok(status.is_active)
}

pub enum AutoSyncResult {
    Skipped,
    Completed { errors: Vec<String> },
}

pub async fn run_auto_sync_cycle() -> AutoSyncResult {
    if !crate::instance::SYNC_ENABLED {return AutoSyncResult::Skipped;}
    let _cycle_guard = sync_cycle_lock().lock().await;
    let Ok(registered) = is_registered_for_sync().await else {
        return AutoSyncResult::Skipped;
    };
    if !registered {
        return AutoSyncResult::Skipped;
    }

    let Ok(sync_ready) = is_sync_ready().await else {
        return AutoSyncResult::Skipped;
    };
    if !sync_ready {
        return AutoSyncResult::Skipped;
    }

    crate::logger::Log::info("Sync cycle started");
    let mut perf = crate::perf::Perf::new("sync_cycle");
    let mut errors = Vec::new();
    if let Err(e) = sync_impl().await {
        errors.push(format!("sync: {}", e));
    }
    perf.stage("upload");
    match device_logs_impl(None).await {
        Ok(pulled) => perf.note("pulled", pulled),
        Err(e) => errors.push(format!("pull logs: {}", e)),
    }
    perf.stage("download");
    perf.note("errors", errors.len());
    perf.done();
    if errors.is_empty() {
        crate::logger::Log::info("Sync cycle completed");
    } else {
        crate::logger::Log::error(format!("Sync cycle failed: {}", errors.join("; ")));
    }
    AutoSyncResult::Completed { errors }
}

#[tauri::command]
pub async fn sync_now(app: AppHandle) -> Result<(), Error> {
    ensure_sync_enabled()?;
    if !is_sync_ready().await? {
        return Err(Error::new(anyhow!("Initial log upload still in progress")));
    }
    let _ = crate::logger::Log::result("Native emit", app.emit("sync_started", ()));
    match run_auto_sync_cycle().await {
        AutoSyncResult::Skipped => {
            return Err(Error::new(anyhow!("Device not registered")));
        }
        AutoSyncResult::Completed { errors } => {
            if errors.is_empty() {
                let _ = crate::logger::Log::result("Native emit", app.emit("sync-successful", ()));
            } else {
                return Err(Error::new(anyhow!(errors.join("; "))));
            }
        }
    }
    request_sync_countdown_reset();
    set_sync_countdown_remaining(SYNC_INTERVAL_SECS as i64);
    let _ = crate::logger::Log::result(
        "Native emit",
        app.emit("count_down_to_sync", SYNC_INTERVAL_SECS as i64),
    );
    Ok(())
}

#[tauri::command]
pub async fn get_sync_countdown() -> Result<Option<i64>, Error> {
    if !is_sync_ready().await? {
        return Ok(None);
    }
    Ok(get_sync_countdown_remaining())
}

#[tauri::command]
pub async fn sync() -> Result<(), Error> {
    ensure_sync_enabled()?;
    let _cycle_guard = sync_cycle_lock().lock().await;
    sync_impl().await
}

async fn sync_impl() -> Result<(), Error> {
    ensure_sync_enabled()?;
    crate::logger::Log::debug("Sync upload phase started");
    if !is_registered_for_sync().await? {
        return Ok(());
    }
    let mut perf = crate::perf::Perf::new("sync_upload");
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let device = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not found"))?;
    if !device.is_active {
        return Err(Error::new(anyhow!("Device is waiting for admin approval")));
    }
    let token = match device.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::from(anyhow!("somehow got remote device?")));
        }
    };
    if device.role == DeviceRole::Consumer {
        return crate::notes_sync::sync(&device.uuid, &token, &server_ip).await;
    }
    let logs = get_logs_for_sync().await?;
    perf.stage("load_logs");
    perf.note("logs", logs.len());
    let deleted_ids: Vec<i64> = get_local_deleted_logs()
        .await?
        .into_iter()
        .map(|logs| logs.id)
        .collect();
    perf.stage("load_deleted");
    perf.note("deleted", deleted_ids.len());

    let body = serde_json::json!({
        "logs": logs,
        "token":token,
        "deleted_log_ids": deleted_ids,
    });
    let res = sync_http_client()?
        .post(sync_server_url(&server_ip, "sync")?)
        .json(&body)
        .send()
        .await?;
    require_authenticated_success(res, &device.uuid).await?;
    perf.stage("http");
    delete_local_deleted_logs().await?;
    if let Some(max) = logs.iter().map(|log| log.id).max() {
        set_last_sync_id(&device.uuid, max).await?;
    }
    crate::notes_sync::sync(&device.uuid, &token, &server_ip).await?;
    upload_afk_evidence(&device.uuid, &token, &server_ip, false).await?;
    perf.stage("finalize");
    perf.done();

    Ok(())
}

#[derive(Debug, Deserialize, Serialize)]
struct ServerDevice {
    #[serde(default)]
    role: DeviceRole,
    name: String,
    uuid: String,
    last_sync_id: i64,
    is_active: bool,
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

async fn sync_devices_with_server() -> Result<HashSet<String>, Error> {
    ensure_sync_enabled()?;
    crate::logger::Log::debug("Sync device-list phase started");
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let local = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not registered"))?;
    if !local.is_active {
        return Err(Error::new(anyhow!("Device is waiting for admin approval")));
    }
    let token = match &local.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::new(anyhow!("Local device state is invalid")))
        }
    };
    let response = sync_http_client()?
        .get(sync_server_url(&server_ip, "devices")?)
        .bearer_auth(token)
        .send()
        .await?;
    let server_devices: Vec<ServerDevice> = require_authenticated_success(response, &local.uuid)
        .await?
        .json::<Vec<ServerDevice>>()
        .await?;

    let local_uuid = get_local_device_uuid().await?;
    let server_uuids: HashSet<String> = server_devices.iter().map(|d| d.uuid.clone()).collect();
    let local_device = get_local_device().await?;
    if let Some(device) = local_device.as_ref() {
        if device.is_active && !server_uuids.contains(&device.uuid) {
            let uuid = &device.uuid;
            invalidate_local_device_registration(uuid).await?;
        }
    }

    let to_insert: Vec<Device> = server_devices
        .iter()
        .filter(|d| local_uuid.as_ref() != Some(&d.uuid))
        .map(|d| {
            let mut device = Device::new(d.uuid.clone(), d.name.clone());
            device.role = d.role;
            device
        })
        .collect();
    insert_devices(to_insert).await?;

    let pool = db::get_pool().await?;
    let mut tx = pool.begin().await?;
    for device in &server_devices {
        sqlx::query("UPDATE devices SET name = ?, role = ?,
                     is_tracking = CASE WHEN ? = 'logger' THEN is_tracking ELSE 0 END
                     WHERE uuid = ? AND kind = 'remote'")
            .bind(&device.name).bind(device.role.as_str()).bind(device.role.as_str())
            .bind(&device.uuid).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    untrack_remote_devices_not_on_server(&server_uuids.iter().cloned().collect::<Vec<_>>()).await?;

    Ok(server_uuids)
}

fn annotate_devices_on_sync_failure(mut devices: Vec<Device>) -> Vec<Device> {
    for device in &mut devices {
        device.available_on_server = match &device.state {
            DeviceState::Local { .. } => true,
            DeviceState::Remote { .. } => true,
        };
    }
    devices
}

async fn annotate_devices_with_local_logs(mut devices: Vec<Device>) -> Result<Vec<Device>, Error> {
    for device in &mut devices {
        if matches!(device.state, DeviceState::Remote { .. }) {
            device.has_local_logs = device_has_logs(&device.uuid).await?;
        }
    }
    Ok(devices)
}

fn annotate_devices_with_server(
    mut devices: Vec<Device>,
    server_uuids: &HashSet<String>,
) -> Vec<Device> {
    for device in &mut devices {
        device.available_on_server = match &device.state {
            DeviceState::Local { .. } => true,
            DeviceState::Remote { .. } => server_uuids.contains(&device.uuid),
        };
    }
    devices
}

#[tauri::command]
pub async fn unsubscribe_device(uuid: String) -> Result<(), Error> {
    unsubscribe_remote_device(uuid).await
}

#[tauri::command]
pub async fn get_devices(app_handle: tauri::AppHandle) -> Result<Vec<Device>, Error> {
    let _lock = sync_cycle_lock().lock().await;
    let mut perf = crate::perf::Perf::new("get_devices");
    if !crate::instance::SYNC_ENABLED {
        perf.done();
        return annotate_devices_with_local_logs(get_devices_from_db().await?).await;
    }
    let local = get_local_device().await?;
    if !local
        .as_ref()
        .map(|device| device.is_active)
        .unwrap_or(false)
    {
        perf.done();
        return Ok(get_devices_from_db()
            .await?
            .into_iter()
            .filter(|device| matches!(device.state, DeviceState::Local { .. }))
            .collect());
    }
    let server_uuids = match sync_devices_with_server().await {
        Ok(uuids) => Some(uuids),
        Err(e) => {
            let _ = crate::logger::Log::result("Native emit", app_handle.emit("Server Error", &e));
            None
        }
    };
    perf.stage("server_devices");
    perf.note("server_ok", server_uuids.is_some());
    let devices = get_devices_from_db().await?;
    let devices = match server_uuids {
        Some(uuids) => annotate_devices_with_server(devices, &uuids),
        None => annotate_devices_on_sync_failure(devices),
    };
    let devices = annotate_devices_with_local_logs(devices).await?;
    perf.stage("local_annotate");
    perf.note("devices", devices.len());
    perf.done();
    Ok(devices)
}
#[tauri::command]
pub async fn device_logs(device_uuid: Option<String>) -> Result<usize, Error> {
    let _lock = sync_cycle_lock().lock().await;
    device_logs_impl(device_uuid).await
}

async fn device_logs_impl(device_uuid: Option<String>) -> Result<usize, Error> {
    ensure_sync_enabled()?;
    crate::logger::Log::debug("Sync download phase started");
    if device_uuid.is_none() && !is_registered_for_sync().await? {
        return Ok(0);
    }
    let mut perf = crate::perf::Perf::new("sync_download");
    let _ =
        crate::logger::Log::result("Sync device list refresh", sync_devices_with_server().await);
    perf.stage("device_list");
    let server_ip = get_server_ip().await?.ok_or(anyhow!("Server IP not set"))?;
    let local = get_local_device()
        .await?
        .ok_or(anyhow!("Local device not registered"))?;
    if !local.is_active {
        return Err(Error::new(anyhow!("Device is waiting for admin approval")));
    }
    let local_uuid = local.uuid.clone();
    let token = match local.state {
        DeviceState::Local { token } => token,
        DeviceState::Remote { .. } => {
            return Err(Error::new(anyhow!("Local device state is invalid")))
        }
    };
    let mut devices: Vec<Device> = get_devices_from_db()
        .await?
        .into_iter()
        .filter(|device| match device.state {
            DeviceState::Local { .. } => false,
            DeviceState::Remote { is_tracking } => is_tracking && device.role == DeviceRole::Logger,
        })
        .collect();

    if let Some(uuid) = &device_uuid {
        devices.retain(|device| &device.uuid == uuid);
    }

    if devices.is_empty() {
        perf.done();
        return Ok(0);
    }

    let de = devices
        .iter()
        .map(|device| ServerDevice {
            name: device.name.clone(),
            role: device.role,
            uuid: device.uuid.clone(),
            last_sync_id: device.last_sync_id,
            is_active: true,
        })
        .collect::<Vec<ServerDevice>>();
    let res = sync_http_client()?
        .get(sync_server_url(&server_ip, "devices/")?)
        .bearer_auth(&token)
        .json(&de)
        .send()
        .await?;
    let res = require_authenticated_success(res, &local_uuid).await?;

    let logs: Vec<Log> = res
        .json::<Vec<ServerLog>>()
        .await?
        .into_iter()
        .map(Log::from)
        .collect();
    perf.stage("http");
    perf.note("logs", logs.len());
    insert_logs(&logs).await?;
    perf.stage("insert");

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
    let mut afk_errors=Vec::new();
    for device in &devices {
        // AFK has its own cursor: evidence may change without any new log IDs.
        // One device's evidence failure must not prevent other devices syncing.
        if let Err(error)=download_afk_evidence(&device.uuid, &local_uuid, &token, &server_ip).await {
            afk_errors.push(format!("AFK history for {}: {error}",device.name));
        }
    }
    perf.stage("finalize");
    perf.done();

    if !afk_errors.is_empty() { return Err(anyhow!(afk_errors.join("; ")).into()); }
    Ok(count)
}


#[cfg(test)]
mod address_tests {
    use super::*;

    #[test]
    fn preserves_user_ports_and_https_and_migrates_bare_hosts() {
        for (input, expected) in [
            ("WORKSTATION", "http://workstation:8765/v1/check"),
            ("host.local:8080", "http://host.local:8080/v1/check"),
            ("https://host.local", "https://host.local/v1/check"),
            ("https://host.local:8443/", "https://host.local:8443/v1/check"),
            ("[::1]", "http://[::1]:8765/v1/check"),
        ] {
            assert_eq!(sync_server_url(input, "check").unwrap(), expected);
        }
        for input in ["", "http://user@host.local", "http://host.local/path", "http://host.local/?token=x", "ftp://host.local"] {
            assert!(normalize_server_address(input).is_err(), "{input}");
        }
    }
}
