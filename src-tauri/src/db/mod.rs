#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]

pub mod backup;
pub mod error;
pub mod pool;
pub mod queries;
pub(crate) mod tables;
pub mod validation;

use anyhow::Context;
use serde::Serialize;
use sqlx;
use tables::cat_regex::{get_cat_regex, CategoryRegex};
use tables::category::{get_categories, Category};
use tables::log::{get_logs, Log};
use tables::skipped_app::{get_skipped_apps, SkippedApp};

pub use error::Error;
pub use pool::{get_pool, reset_pool};
pub use queries::get_week;

#[derive(Serialize)]
pub struct DbMigrationInfo {
    pub version: i64,
    pub description: String,
    pub installed_on: String,
    pub success: bool,
}

#[tauri::command]
pub async fn get_db_schema_version() -> Result<Vec<DbMigrationInfo>, Error> {
    use sqlx::Row;
    let pool = get_pool().await?;
    let rows = sqlx::query(
        "SELECT version, description, installed_on, success FROM _sqlx_migrations ORDER BY version",
    )
    .fetch_all(&pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let version: i64 = row.try_get("version")?;
        let description: String = row.try_get("description")?;
        let installed_on: String = row.try_get("installed_on")?;
        let success: i64 = row.try_get("success")?;
        out.push(DbMigrationInfo {
            version,
            description,
            installed_on,
            success: success != 0,
        });
    }

    Ok(out)
}

#[tauri::command]
pub fn get_db_path_cmd() -> String {
    get_db_path().to_string_lossy().to_string()
}

pub use pool::get_db_path;

#[derive(Serialize)]
pub struct BackupInfoResponse {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
    pub backup_type: String,
}

#[tauri::command]
pub fn list_backups() -> Result<Vec<BackupInfoResponse>, Error> {
    let backups = backup::list_backups().context("Failed to list backups")?;

    Ok(backups
        .into_iter()
        .map(|b| {
            let modified = b
                .modified
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_default();

            BackupInfoResponse {
                name: b.name,
                path: b.path.to_string_lossy().to_string(),
                size: b.size,
                modified,
                backup_type: format!("{:?}", b.backup_type),
            }
        })
        .collect())
}

#[tauri::command]
pub fn create_manual_backup(name: String) -> Result<String, Error> {
    let path = backup::create_manual_backup(&name).context("Failed to create backup")?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_backup(backup_name: String) -> Result<(), Error> {
    reset_pool().await?;

    backup::restore_backup(&backup_name).context("Failed to restore backup")?;

    get_pool().await?;

    Ok(())
}

#[tauri::command]
pub fn get_backup_dir() -> String {
    backup::get_backup_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn create_safety_backup(reason: String) -> Result<String, Error> {
    let path = backup::create_safety_backup(&reason).context("Failed to create safety backup")?;

    Ok(path.to_string_lossy().to_string())
}
