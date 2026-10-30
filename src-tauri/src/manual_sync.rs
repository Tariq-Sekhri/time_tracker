//! Keeps the manual timer in step across devices through the sync server.
//!
//! The local timer stays the source the UI reads, so manual tracking still
//! works offline. When sync is ready, local edits are pushed to the server and
//! a WebSocket applies timers started, edited, or stopped on other devices.

use crate::db::tables::app_metadata_kv::{get_server_ip, metadata_get, metadata_set};
use crate::db::tables::device::{get_local_device, DeviceState};
use crate::db::tables::manual_time_block::{RunningManualTimer, RUNNING_TIMER_KEY};
use crate::db::{self, Error};
use crate::logger::Log;
use crate::sync::{require_authenticated_success, sync_http_client, sync_server_url};
use anyhow::anyhow;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::header, Message};

const ENTRIES_CURSOR_KEY: &str = "manual_entries_cursor_v1";
const ENTRIES_PAGE_SIZE: usize = 500;
const PING_INTERVAL: Duration = Duration::from_secs(30);
const SILENCE_LIMIT: Duration = Duration::from_secs(75);
const RECONNECT_DELAY: Duration = Duration::from_secs(5);
const RECONNECT_DELAY_AFTER_FAILURE: Duration = Duration::from_secs(15);
/// Servers from before manual sync have no live endpoint; check back rarely.
const RECONNECT_DELAY_OLD_SERVER: Duration = Duration::from_secs(10 * 60);

static APP: OnceLock<AppHandle> = OnceLock::new();
static LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ServerTimer {
    session_id: String,
    title: String,
    project_name: Option<String>,
    start_time: i64,
    #[serde(default)]
    version: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ServerEntry {
    #[serde(default)]
    id: i64,
    session_id: String,
    title: String,
    project_name: Option<String>,
    start_time: i64,
    end_time: i64,
}

#[derive(Serialize)]
struct ServerProject {
    name: String,
    color: String,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    Timer { timer: Option<ServerTimer> },
    Entry,
    #[serde(other)]
    Other,
}

struct Connection {
    server_ip: String,
    token: String,
}

async fn connection() -> Result<Option<Connection>, Error> {
    if !crate::instance::SYNC_ENABLED || !crate::sync::is_sync_ready().await? {
        return Ok(None);
    }
    let Some(device) = get_local_device().await? else { return Ok(None) };
    let DeviceState::Local { token } = device.state else { return Ok(None) };
    let Some(server_ip) = get_server_ip().await? else { return Ok(None) };
    Ok(Some(Connection { server_ip, token }))
}

/// Servers from before manual sync answer its endpoints with 404/405. The
/// timer then stays local-only until the server is updated.
fn old_server(status: reqwest::StatusCode) -> bool {
    matches!(status, reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::METHOD_NOT_ALLOWED)
}

#[derive(Debug)]
struct OldServer;

impl std::fmt::Display for OldServer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("the sync server does not support manual timer sync yet")
    }
}

impl std::error::Error for OldServer {}

fn emit(event: &str) {
    if let Some(app) = APP.get() {
        let _ = Log::result("Native emit", app.emit(event, ()));
    }
}

fn spawn_logged<F>(context: &'static str, task: F)
where
    F: std::future::Future<Output = Result<(), Error>> + Send + 'static,
{
    if !crate::instance::SYNC_ENABLED {
        return;
    }
    tauri::async_runtime::spawn(async move {
        if let Err(error) = task.await {
            Log::warn(format!("Manual sync {context} failed: {error}"));
        }
    });
}

/// The running timer was started or edited on this device.
pub fn timer_changed_locally() {
    spawn_logged("timer push", push_timer());
}

/// A manual block was recorded from a timer on this device.
pub fn entries_changed_locally() {
    spawn_logged("entry upload", upload_pending());
}

pub fn projects_changed_locally() {
    spawn_logged("project push", push_projects());
}

async fn read_timer(pool: &SqlitePool) -> Result<Option<RunningManualTimer>, Error> {
    metadata_get(pool, RUNNING_TIMER_KEY)
        .await?
        .map(|value| serde_json::from_str(&value).map_err(|e| anyhow::Error::new(e).into()))
        .transpose()
}

async fn write_timer(pool: &SqlitePool, timer: Option<&RunningManualTimer>) -> Result<(), Error> {
    match timer {
        Some(timer) => {
            let value = serde_json::to_string(timer).map_err(anyhow::Error::new)?;
            metadata_set(pool, RUNNING_TIMER_KEY, &value).await?;
        }
        None => {
            sqlx::query("DELETE FROM app_metadata WHERE key = ?1")
                .bind(RUNNING_TIMER_KEY)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}

async fn project_name(pool: &SqlitePool, id: Option<i64>) -> Result<Option<String>, Error> {
    crate::db::tables::manual_project::sync_name(pool, id).await
}

/// Projects are matched by name across devices ("Parent › Child" for
/// subcategories); unknown names are created.
async fn project_id(pool: &SqlitePool, name: Option<&str>) -> Result<Option<i64>, Error> {
    crate::db::tables::manual_project::id_for_sync_name(pool, name).await
}

async fn session_recorded(pool: &SqlitePool, session_id: &str) -> Result<bool, Error> {
    Ok(
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM manual_time_blocks WHERE session_id = ?1)")
            .bind(session_id)
            .fetch_one(pool)
            .await?,
    )
}

async fn adopt(pool: &SqlitePool, server: &ServerTimer) -> Result<bool, Error> {
    // A session this device already recorded must not come back as running.
    if session_recorded(pool, &server.session_id).await? {
        return Ok(false);
    }
    let timer = RunningManualTimer {
        title: server.title.clone(),
        notes: None,
        project_id: project_id(pool, server.project_name.as_deref()).await?,
        start_time: server.start_time,
        end_time: None,
        session_id: Some(server.session_id.clone()),
        synced: true,
        version: server.version,
    };
    write_timer(pool, Some(&timer)).await?;
    Ok(true)
}

async fn push_timer() -> Result<(), Error> {
    let _guard = LOCK.lock().await;
    push_timer_locked().await
}

async fn push_timer_locked() -> Result<(), Error> {
    let Some(conn) = connection().await? else { return Ok(()) };
    let pool = db::get_pool().await?;
    let Some(mut local) = read_timer(&pool).await? else { return Ok(()) };
    // A stopped timer is about to be recorded; the entry upload ends it remotely.
    if local.end_time.is_some() {
        return Ok(());
    }
    let session_id = match local.session_id.clone() {
        Some(id) => id,
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            local.session_id = Some(id.clone());
            write_timer(&pool, Some(&local)).await?;
            id
        }
    };
    let body = ServerTimer {
        session_id: session_id.clone(),
        title: local.title.clone(),
        project_name: project_name(&pool, local.project_id).await?,
        start_time: local.start_time,
        version: 0,
    };
    let response = sync_http_client()?
        .put(sync_server_url(&conn.server_ip, "manual/timer"))
        .bearer_auth(&conn.token)
        .json(&body)
        .send()
        .await?;
    let device = get_local_device().await?.ok_or(anyhow!("Local device not found"))?;
    // Re-read: the user may have edited the timer while the request was in flight.
    let current = read_timer(&pool).await?;
    let same_session = |t: &RunningManualTimer| t.session_id.as_deref() == Some(session_id.as_str());
    match response.status() {
        status if old_server(status) => {}
        reqwest::StatusCode::CONFLICT => {
            let running: ServerTimer = response.json().await?;
            if current.as_ref().is_some_and(|t| same_session(t) && t.end_time.is_none()) {
                Log::info("Manual timer is already running on another device; using it");
                adopt(&pool, &running).await?;
                emit("manual-timer-changed");
            }
        }
        reqwest::StatusCode::GONE => {
            // Stopped elsewhere before this edit arrived.
            if current.as_ref().is_some_and(|t| same_session(t) && t.end_time.is_none()) {
                write_timer(&pool, None).await?;
                emit("manual-timer-changed");
            }
            pull_entries_locked(&conn).await?;
        }
        _ => {
            let saved: ServerTimer = require_authenticated_success(response, &device.uuid)
                .await?
                .json()
                .await?;
            if let Some(mut current) = current.filter(|t| same_session(t)) {
                // Edits made during the request are still unsent; their own push follows.
                current.synced = current.title == body.title
                    && project_name(&pool, current.project_id).await? == body.project_name
                    && current.start_time == body.start_time;
                current.version = current.version.max(saved.version);
                write_timer(&pool, Some(&current)).await?;
            }
        }
    }
    Ok(())
}

#[derive(Debug, PartialEq)]
enum Reconcile {
    Keep,
    Push,
    Adopt,
    Clear,
}

/// Decides how a timer state from the server meets the local timer.
fn reconcile(server: Option<&ServerTimer>, local: Option<&RunningManualTimer>) -> Reconcile {
    match (server, local) {
        // Never replace a timer the user has just stopped and is recording.
        (_, Some(local)) if local.end_time.is_some() => Reconcile::Keep,
        // Unsent local edits win; pushing them also resolves offline conflicts.
        (_, Some(local)) if !local.synced => Reconcile::Push,
        (Some(server), Some(local))
            if local.session_id.as_deref() == Some(server.session_id.as_str())
                && server.version <= local.version =>
        {
            Reconcile::Keep
        }
        (Some(_), _) => Reconcile::Adopt,
        // Stopped on another device.
        (None, Some(_)) => Reconcile::Clear,
        (None, None) => Reconcile::Keep,
    }
}

async fn apply_remote_timer(conn: &Connection, server: Option<ServerTimer>) -> Result<(), Error> {
    let _guard = LOCK.lock().await;
    let pool = db::get_pool().await?;
    let local = read_timer(&pool).await?;
    let changed = match (reconcile(server.as_ref(), local.as_ref()), server) {
        (Reconcile::Push, _) => return push_timer_locked().await,
        (Reconcile::Adopt, Some(server)) => adopt(&pool, &server).await?,
        (Reconcile::Clear, _) => {
            write_timer(&pool, None).await?;
            pull_entries_locked(conn).await?;
            true
        }
        _ => false,
    };
    if changed {
        emit("manual-timer-changed");
    }
    Ok(())
}

async fn upload_pending() -> Result<(), Error> {
    let _guard = LOCK.lock().await;
    let Some(conn) = connection().await? else { return Ok(()) };
    upload_pending_locked(&conn).await
}

async fn upload_pending_locked(conn: &Connection) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let device = get_local_device().await?.ok_or(anyhow!("Local device not found"))?;
    let pending: Vec<(i64, String, String, Option<i64>, i64, i64)> = sqlx::query_as(
        "SELECT id, session_id, title, project_id, start_time, end_time
         FROM manual_time_blocks
         WHERE pending_upload = 1 AND session_id IS NOT NULL ORDER BY id",
    )
    .fetch_all(&pool)
    .await?;
    for (id, session_id, title, project_id, start_time, end_time) in pending {
        let project_name = project_name(&pool, project_id).await?;
        let entry = ServerEntry { id: 0, session_id, title, project_name, start_time, end_time };
        let response = sync_http_client()?
            .post(sync_server_url(&conn.server_ip, "manual/entries"))
            .bearer_auth(&conn.token)
            .json(&entry)
            .send()
            .await?;
        if old_server(response.status()) {
            return Ok(());
        }
        require_authenticated_success(response, &device.uuid).await?;
        sqlx::query("UPDATE manual_time_blocks SET pending_upload = 0 WHERE id = ?1")
            .bind(id)
            .execute(&pool)
            .await?;
    }
    Ok(())
}

async fn pull_entries(conn: &Connection) -> Result<(), Error> {
    let _guard = LOCK.lock().await;
    pull_entries_locked(conn).await
}

/// Imports blocks finished on other devices. Blocks this device recorded
/// itself are recognised by session ID and skipped.
async fn pull_entries_locked(conn: &Connection) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let device = get_local_device().await?.ok_or(anyhow!("Local device not found"))?;
    let mut cursor: i64 = metadata_get(&pool, ENTRIES_CURSOR_KEY)
        .await?
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let mut imported = 0;
    loop {
        let response = sync_http_client()?
            .get(sync_server_url(&conn.server_ip, "manual/entries"))
            .bearer_auth(&conn.token)
            .query(&[("after", cursor)])
            .send()
            .await?;
        if old_server(response.status()) {
            return Ok(());
        }
        let page: Vec<ServerEntry> = require_authenticated_success(response, &device.uuid)
            .await?
            .json()
            .await?;
        for entry in &page {
            if !session_recorded(&pool, &entry.session_id).await? {
                let project = project_id(&pool, entry.project_name.as_deref()).await?;
                sqlx::query(
                    "INSERT INTO manual_time_blocks
                     (title, notes, start_time, end_time, created_at, updated_at, project_id, session_id, pending_upload)
                     VALUES (?1, NULL, ?2, ?3, ?4, ?4, ?5, ?6, 0)",
                )
                .bind(&entry.title)
                .bind(entry.start_time)
                .bind(entry.end_time)
                .bind(chrono::Utc::now().timestamp())
                .bind(project)
                .bind(&entry.session_id)
                .execute(&pool)
                .await?;
                imported += 1;
            }
            cursor = cursor.max(entry.id);
        }
        metadata_set(&pool, ENTRIES_CURSOR_KEY, &cursor.to_string()).await?;
        if page.len() < ENTRIES_PAGE_SIZE {
            break;
        }
    }
    if imported > 0 {
        Log::info(format!("Imported {imported} manual time block(s) from other devices"));
        emit("manual-entries-changed");
    }
    Ok(())
}

async fn push_projects() -> Result<(), Error> {
    let Some(conn) = connection().await? else { return Ok(()) };
    push_projects_with(&conn).await
}

async fn push_projects_with(conn: &Connection) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let device = get_local_device().await?.ok_or(anyhow!("Local device not found"))?;
    let categories = crate::db::tables::manual_project::categories_for_pool(&pool).await?;
    let projects: Vec<ServerProject> = categories
        .iter()
        .filter(|category| category.id.is_some())
        .map(|category| {
            let parent = category.parent_id.and_then(|id| categories.iter().find(|parent| parent.id == Some(id)));
            ServerProject {
                name: match parent {
                    Some(parent) => format!("{}{}{}", parent.name, crate::db::tables::manual_project::PATH_SEPARATOR, category.name),
                    None => category.name.clone(),
                },
                color: category.color.clone(),
            }
        })
        .collect();
    let response = sync_http_client()?
        .put(sync_server_url(&conn.server_ip, "manual/projects"))
        .bearer_auth(&conn.token)
        .json(&projects)
        .send()
        .await?;
    if old_server(response.status()) {
        return Ok(());
    }
    require_authenticated_success(response, &device.uuid).await?;
    Ok(())
}

/// Sends blocks recorded while disconnected, then pulls what was missed. The
/// running timer is reconciled by the server's first message instead.
async fn catch_up(conn: &Connection) -> Result<(), Error> {
    push_projects_with(conn).await?;
    {
        let _guard = LOCK.lock().await;
        upload_pending_locked(conn).await?;
    }
    pull_entries(conn).await
}

async fn listen(conn: Connection) -> Result<(), Error> {
    let url = sync_server_url(&conn.server_ip, "ws").replacen("http://", "ws://", 1);
    let mut request = url.as_str().into_client_request().map_err(anyhow::Error::new)?;
    request.headers_mut().insert(
        header::AUTHORIZATION,
        format!("Bearer {}", conn.token).parse().map_err(anyhow::Error::new)?,
    );
    let (socket, _) = tokio::time::timeout(Duration::from_secs(10), tokio_tungstenite::connect_async(request))
        .await
        .map_err(|_| anyhow!("Timed out connecting to {url}"))?
        .map_err(|e| match e {
            tokio_tungstenite::tungstenite::Error::Http(response) if response.status() == 404 => {
                anyhow::Error::new(OldServer)
            }
            e => anyhow!("Could not connect to {url}: {e}"),
        })?;
    Log::info("Manual timer live sync connected");
    let (mut write, mut read) = socket.split();
    if let Err(error) = catch_up(&conn).await {
        Log::warn(format!("Manual sync catch-up failed: {error}"));
    }
    let mut ping = tokio::time::interval(PING_INTERVAL);
    let mut last_heard = tokio::time::Instant::now();
    loop {
        tokio::select! {
            message = read.next() => {
                let message = match message {
                    Some(Ok(message)) => message,
                    Some(Err(error)) => return Err(anyhow!("Live sync connection failed: {error}").into()),
                    None => return Ok(()),
                };
                last_heard = tokio::time::Instant::now();
                let Message::Text(text) = message else { continue };
                let result = match serde_json::from_str::<Event>(text.as_str()) {
                    Ok(Event::Timer { timer }) => apply_remote_timer(&conn, timer).await,
                    Ok(Event::Entry) => pull_entries(&conn).await,
                    Ok(Event::Other) => Ok(()),
                    Err(error) => Err(anyhow!("Unreadable live sync message: {error}").into()),
                };
                if let Err(error) = result {
                    Log::warn(format!("Manual sync update failed: {error}"));
                }
            }
            _ = ping.tick() => {
                if last_heard.elapsed() > SILENCE_LIMIT {
                    return Err(anyhow!("Live sync connection went silent").into());
                }
                write.send(Message::Ping(Vec::new().into())).await.map_err(anyhow::Error::new)?;
            }
        }
    }
}

/// Holds a live connection to the sync server whenever sync is ready.
pub async fn run(app: AppHandle) {
    let _ = APP.set(app);
    if !crate::instance::SYNC_ENABLED {
        Log::info("Manual timer live sync disabled in dev and beta builds");
        return;
    }
    loop {
        let delay = match connection().await {
            Ok(Some(conn)) => match listen(conn).await {
                Ok(()) => RECONNECT_DELAY,
                Err(error) if error.0.is::<OldServer>() => {
                    Log::info(format!("Manual timer stays on this device: {error}"));
                    RECONNECT_DELAY_OLD_SERVER
                }
                Err(error) => {
                    Log::warn(format!("Manual timer live sync disconnected: {error}"));
                    RECONNECT_DELAY_AFTER_FAILURE
                }
            },
            _ => RECONNECT_DELAY,
        };
        tokio::time::sleep(delay).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(session: &str, version: i64) -> ServerTimer {
        ServerTimer {
            session_id: session.into(),
            title: "Remote".into(),
            project_name: None,
            start_time: 100,
            version,
        }
    }

    fn local(session: &str, version: i64, synced: bool) -> RunningManualTimer {
        RunningManualTimer {
            title: "Local".into(),
            start_time: 100,
            session_id: Some(session.into()),
            synced,
            version,
            ..Default::default()
        }
    }

    #[test]
    fn timer_started_elsewhere_appears_and_stopping_elsewhere_clears_it() {
        assert_eq!(reconcile(Some(&server("a", 1)), None), Reconcile::Adopt);
        assert_eq!(reconcile(None, Some(&local("a", 1, true))), Reconcile::Clear);
        assert_eq!(reconcile(None, None), Reconcile::Keep);
    }

    #[test]
    fn newer_remote_edits_apply_but_stale_ones_do_not() {
        assert_eq!(reconcile(Some(&server("a", 3)), Some(&local("a", 2, true))), Reconcile::Adopt);
        assert_eq!(reconcile(Some(&server("a", 2)), Some(&local("a", 2, true))), Reconcile::Keep);
        assert_eq!(reconcile(Some(&server("b", 1)), Some(&local("a", 5, true))), Reconcile::Adopt);
    }

    #[test]
    fn unsent_local_edits_are_pushed_and_stopped_timers_are_kept() {
        assert_eq!(reconcile(Some(&server("a", 3)), Some(&local("a", 2, false))), Reconcile::Push);
        assert_eq!(reconcile(None, Some(&local("a", 0, false))), Reconcile::Push);
        let mut stopped = local("a", 1, true);
        stopped.end_time = Some(200);
        assert_eq!(reconcile(None, Some(&stopped)), Reconcile::Keep);
        assert_eq!(reconcile(Some(&server("b", 1)), Some(&stopped)), Reconcile::Keep);
    }
}
