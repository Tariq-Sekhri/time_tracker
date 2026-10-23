//! Import & export of tracked data.
//!
//! The serde types mirror the TypeScript contract in `src/api/dataTransfer.ts`
//! exactly. The core logic takes a `&SqlitePool` so it can be tested against an
//! in-memory database; the Tauri commands only gather runtime context and delegate.

mod export;
mod import;
#[cfg(test)]
mod tests;

use crate::db::{self, Error};
use crate::logger::Log as AppLog;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};

/// Files larger than this are refused by `read_import_file`.
const MAX_IMPORT_FILE_BYTES: u64 = 200 * 1024 * 1024;
const EXPORT_PATH_HEADER: &str = "x-export-path";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExportInclude {
    pub manual_entries: bool,
    pub activity_sessions: bool,
    pub activity_logs: bool,
    pub devices: bool,
    pub activity_categories: bool,
    pub manual_categories: bool,
    pub app_groups: bool,
    pub skipped_apps: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportScope {
    /// Inclusive start.
    pub range_start: i64,
    /// Exclusive end.
    pub range_end: i64,
    /// None = every device. Filters activity sessions and logs only.
    pub device_uuids: Option<Vec<String>>,
    /// Activity category names; None = all. Filters activity sessions and logs only.
    pub activity_categories: Option<Vec<String>>,
    /// Manual category ids; None = all. A `None` element selects Uncategorized.
    pub manual_category_ids: Option<Vec<Option<i64>>>,
    pub include: ExportInclude,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportManualEntry {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub category_id: Option<i64>,
    pub category: String,
    pub parent_category: Option<String>,
    pub category_color: String,
    pub start_time: i64,
    pub end_time: i64,
    pub duration: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportSessionApp {
    pub app: String,
    pub duration: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportActivitySession {
    pub device_uuid: String,
    pub device_name: String,
    pub category: String,
    pub category_color: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
    pub duration: i64,
    pub active_duration: i64,
    pub apps: Vec<ExportSessionApp>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportActivityLog {
    pub device_uuid: String,
    pub device_name: String,
    pub id: i64,
    pub app: String,
    pub app_group: Option<String>,
    pub category: String,
    pub timestamp: i64,
    pub duration: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportDevice {
    pub uuid: String,
    pub name: String,
    /// "local" or "remote".
    pub kind: String,
    pub in_cal: bool,
    pub in_stats: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportActivityCategory {
    pub name: String,
    pub color: Option<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default = "default_true")]
    pub is_visible: bool,
    #[serde(default = "default_true")]
    pub in_stats: bool,
    #[serde(default)]
    pub rules: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportManualCategory {
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
    pub parent_id: Option<i64>,
    pub parent_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportAppGroup {
    pub name: String,
    pub regex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportDataset {
    pub generated_at: i64,
    pub app_version: String,
    pub range_start: i64,
    pub range_end: i64,
    pub manual_entries: Vec<ExportManualEntry>,
    pub activity_sessions: Vec<ExportActivitySession>,
    pub activity_logs: Vec<ExportActivityLog>,
    pub devices: Vec<ExportDevice>,
    pub activity_categories: Vec<ExportActivityCategory>,
    pub manual_categories: Vec<ExportManualCategory>,
    pub app_groups: Vec<ExportAppGroup>,
    pub skipped_apps: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActivityCategoryOption {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportFilterOptions {
    pub devices: Vec<ExportDevice>,
    pub activity_categories: Vec<ActivityCategoryOption>,
    pub manual_categories: Vec<ExportManualCategory>,
    pub data_start: Option<i64>,
    pub data_end: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportManualEntry {
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub category_path: Vec<String>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportManualCategory {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub parent_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportActivityLog {
    pub device_uuid: String,
    pub id: i64,
    pub app: String,
    pub timestamp: i64,
    pub duration: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportDevice {
    pub uuid: String,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DuplicateStrategy {
    #[default]
    Skip,
    Import,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImportRequest {
    pub dry_run: bool,
    #[serde(default)]
    pub duplicate_strategy: DuplicateStrategy,
    #[serde(default = "default_true")]
    pub create_missing_categories: bool,
    #[serde(default)]
    pub manual_entries: Vec<ImportManualEntry>,
    #[serde(default)]
    pub manual_categories: Vec<ImportManualCategory>,
    #[serde(default)]
    pub activity_categories: Vec<ExportActivityCategory>,
    #[serde(default)]
    pub app_groups: Vec<ExportAppGroup>,
    #[serde(default)]
    pub skipped_apps: Vec<String>,
    #[serde(default)]
    pub devices: Vec<ImportDevice>,
    #[serde(default)]
    pub activity_logs: Vec<ImportActivityLog>,
}

impl ImportRequest {
    fn is_empty(&self) -> bool {
        self.manual_entries.is_empty()
            && self.manual_categories.is_empty()
            && self.activity_categories.is_empty()
            && self.app_groups.is_empty()
            && self.skipped_apps.is_empty()
            && self.devices.is_empty()
            && self.activity_logs.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImportRowIssue {
    pub index: usize,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ImportReport {
    pub dry_run: bool,
    pub manual_entries_imported: u64,
    pub manual_entries_duplicate: u64,
    pub duplicate_indices: Vec<usize>,
    pub manual_entries_invalid: Vec<ImportRowIssue>,
    pub manual_categories_created: Vec<String>,
    pub activity_categories_created: Vec<String>,
    pub category_rules_added: u64,
    pub app_groups_added: u64,
    pub skipped_apps_added: u64,
    pub devices_added: u64,
    pub activity_logs_imported: u64,
    pub activity_logs_duplicate: u64,
}

#[tauri::command]
pub async fn get_export_filter_options() -> Result<ExportFilterOptions, Error> {
    let pool = db::get_pool().await?;
    export::filter_options(&pool).await
}

#[tauri::command]
pub async fn export_dataset(app: tauri::AppHandle, scope: ExportScope) -> Result<ExportDataset, Error> {
    let mut perf = crate::perf::Perf::new("export_dataset");
    let pool = db::get_pool().await?;
    let (_, settings) = crate::db::queries::week::load_runtime_settings().await?;
    let context = export::ExportContext {
        settings: &settings,
        app_version: app.package_info().version.to_string(),
        generated_at: chrono::Utc::now().timestamp(),
    };
    let dataset = export::export(&pool, &scope, &context).await?;
    perf.note("manual_entries", dataset.manual_entries.len());
    perf.note("sessions", dataset.activity_sessions.len());
    perf.note("logs", dataset.activity_logs.len());
    perf.done();
    Ok(dataset)
}

#[tauri::command]
pub async fn import_dataset(request: ImportRequest) -> Result<ImportReport, Error> {
    let mut perf = crate::perf::Perf::new("import_dataset");
    if !request.dry_run && !request.is_empty() {
        let pool = db::get_pool().await?;
        let backup_dir = crate::db::backup::get_backup_dir();
        tokio::fs::create_dir_all(&backup_dir).await?;
        let backup = backup_dir.join(format!(
            "safety_{}_{}_pre_import.db",
            chrono::Local::now().format("%Y-%m-%d_%H-%M-%S"),
            uuid::Uuid::new_v4().simple(),
        ));
        snapshot_before_import(&pool, &backup).await?;
        AppLog::info(format!("Safety database backup created path={}", backup.display()));
        // Keep the five most recent import snapshots. Other backup types retain
        // their existing retention rules.
        let _ = AppLog::result("Clean up import backups", prune_import_backups(&backup_dir).await);
        perf.stage("backup");
    }
    let pool = db::get_pool().await?;
    let report = import::import(&pool, &request, chrono::Utc::now().timestamp()).await?;
    perf.stage("import");
    if !report.dry_run {
        if !report.manual_categories_created.is_empty() {
            crate::manual_sync::projects_changed_locally();
        }
        AppLog::info(format!(
            "Data import: {} manual entries ({} duplicate, {} invalid), {} manual categories, {} activity categories, {} rules, {} app groups, {} skipped apps, {} devices, {} activity logs ({} duplicate)",
            report.manual_entries_imported,
            report.manual_entries_duplicate,
            report.manual_entries_invalid.len(),
            report.manual_categories_created.len(),
            report.activity_categories_created.len(),
            report.category_rules_added,
            report.app_groups_added,
            report.skipped_apps_added,
            report.devices_added,
            report.activity_logs_imported,
            report.activity_logs_duplicate,
        ));
    }
    perf.done();
    Ok(report)
}

/// SQLite writes a consistent snapshot including WAL data while tracking may
/// continue. A filesystem copy after a checkpoint can race with other writers.
async fn snapshot_before_import(pool: &sqlx::SqlitePool, path: &Path) -> Result<(), Error> {
    if let Err(error) = sqlx::query("VACUUM INTO ?1")
        .bind(path.to_string_lossy().as_ref())
        .execute(pool)
        .await
    {
        let _ = tokio::fs::remove_file(path).await;
        return Err(anyhow::anyhow!("Could not back up the database before importing: {error}").into());
    }
    Ok(())
}

async fn prune_import_backups(dir: &Path) -> std::io::Result<()> {
    let mut entries = tokio::fs::read_dir(dir).await?;
    let mut paths = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("safety_") && name.ends_with("_pre_import.db") {
            paths.push(entry.path());
        }
    }
    paths.sort();
    let expired = paths.len().saturating_sub(5);
    for path in paths.into_iter().take(expired) {
        tokio::fs::remove_file(path).await?;
    }
    Ok(())
}

fn body_bytes(body: &InvokeBody) -> Result<std::borrow::Cow<'_, [u8]>, Error> {
    match body {
        InvokeBody::Raw(bytes) => Ok(std::borrow::Cow::Borrowed(bytes.as_slice())),
        InvokeBody::Json(value) => {
            let bytes: Vec<u8> = serde_json::from_value(value.clone())
                .map_err(|error| anyhow::anyhow!("Export data must be sent as bytes: {error}"))?;
            Ok(std::borrow::Cow::Owned(bytes))
        }
    }
}

fn export_path(encoded: &str) -> Result<PathBuf, Error> {
    let decoded = urlencoding::decode(encoded)
        .map_err(|error| anyhow::anyhow!("Invalid export path: {error}"))?;
    let path = PathBuf::from(decoded.as_ref());
    if decoded.trim().is_empty() || !path.is_absolute() || path.file_name().is_none() {
        return Err(anyhow::anyhow!("Choose a full file path to save the export to").into());
    }
    Ok(path)
}

/// Writes to a temporary sibling first so an interrupted save never leaves a
/// truncated file in place of an earlier export.
fn write_file_replacing(path: &Path, bytes: &[u8]) -> Result<(), Error> {
    let parent = path
        .parent()
        .filter(|parent| parent.is_dir())
        .ok_or_else(|| anyhow::anyhow!("The folder {} does not exist", path.parent().unwrap_or(path).display()))?;
    let file_name = path.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_default();
    let temp = parent.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4().simple()));
    let result = std::fs::write(&temp, bytes).and_then(|()| std::fs::rename(&temp, path));
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp);
        return Err(anyhow::anyhow!("Could not save {}: {error}", path.display()).into());
    }
    Ok(())
}

/// Receives the file contents as a raw IPC body; the destination path is sent
/// percent-encoded in the `x-export-path` header.
#[tauri::command]
pub async fn save_export_file(request: Request<'_>) -> Result<(), Error> {
    let encoded = request
        .headers()
        .get(EXPORT_PATH_HEADER)
        .ok_or_else(|| anyhow::anyhow!("Missing export path"))?
        .to_str()
        .map_err(|error| anyhow::anyhow!("Invalid export path header: {error}"))?;
    let path = export_path(encoded)?;
    let bytes = body_bytes(request.body())?.into_owned();
    let size = bytes.len();
    let target = path.clone();
    tauri::async_runtime::spawn_blocking(move || write_file_replacing(&target, &bytes))
        .await
        .map_err(anyhow::Error::new)??;
    AppLog::info(format!("Export saved bytes={size} path={}", path.display()));
    Ok(())
}

fn check_import_size(size: u64) -> Result<(), Error> {
    if size > MAX_IMPORT_FILE_BYTES {
        return Err(anyhow::anyhow!(
            "This file is {:.0} MB; files larger than {} MB cannot be imported",
            size as f64 / (1024.0 * 1024.0),
            MAX_IMPORT_FILE_BYTES / (1024 * 1024)
        )
        .into());
    }
    Ok(())
}

#[tauri::command]
pub async fn read_import_file(path: String) -> Result<Response, Error> {
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| anyhow::anyhow!("Could not open {path}: {error}"))?;
    if !metadata.is_file() {
        return Err(anyhow::anyhow!("{path} is not a file").into());
    }
    check_import_size(metadata.len())?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|error| anyhow::anyhow!("Could not read {path}: {error}"))?;
    check_import_size(bytes.len() as u64)?;
    Ok(Response::new(bytes))
}
