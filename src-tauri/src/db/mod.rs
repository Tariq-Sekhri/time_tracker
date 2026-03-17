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

#[derive(Serialize)]
pub struct AllDbData {
    pub logs: Vec<Log>,
    pub categories: Vec<Category>,
    pub category_regex: Vec<CategoryRegex>,
    pub skipped_apps: Vec<SkippedApp>,
}

#[tauri::command]
pub async fn get_all_db_data() -> Result<AllDbData, Error> {
    let logs = get_logs().await?;
    let categories = get_categories().await?;
    let category_regex = get_cat_regex().await?;
    let skipped_apps = get_skipped_apps().await?;

    Ok(AllDbData {
        logs,
        categories,
        category_regex,
        skipped_apps,
    })
}

#[tauri::command]
pub fn get_db_path_cmd() -> String {
    get_db_path().to_string_lossy().to_string()
}

pub use pool::get_db_path;

#[tauri::command]
pub async fn wipe_all_data() -> Result<(), Error> {
    let _ = backup::create_safety_backup("pre_wipe");
    
    let pool = get_pool().await?;

    sqlx::query!("DELETE FROM logs").execute(&pool).await?;
    sqlx::query!("DELETE FROM category_regex").execute(&pool).await?;
    sqlx::query!("DELETE FROM category").execute(&pool).await?;
    sqlx::query!("DELETE FROM skipped_apps").execute(&pool).await?;

    tables::category::create_table(&pool).await?;
    tables::cat_regex::create_table(&pool).await?;
    tables::skipped_app::create_table(&pool).await?;

    Ok(())
}

#[tauri::command]
pub async fn reset_database() -> Result<(), Error> {
    let _ = backup::create_safety_backup("pre_reset");
    
    reset_pool().await?;
    pool::drop_all().context("Failed to delete database file")?;
    get_pool().await?;
    Ok(())
}


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
    let backups = backup::list_backups()
        .context("Failed to list backups")?;
    
    Ok(backups.into_iter().map(|b| {
        let modified = b.modified
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
    }).collect())
}

#[tauri::command]
pub fn create_manual_backup(name: String) -> Result<String, Error> {
    let path = backup::create_manual_backup(&name)
        .context("Failed to create backup")?;
    
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_backup(backup_name: String) -> Result<(), Error> {
    reset_pool().await?;
    
    backup::restore_backup(&backup_name)
        .context("Failed to restore backup")?;
    
    get_pool().await?;
    
    Ok(())
}

#[tauri::command]
pub fn get_backup_dir() -> String {
    backup::get_backup_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn create_safety_backup(reason: String) -> Result<String, Error> {
    let path = backup::create_safety_backup(&reason)
        .context("Failed to create safety backup")?;
    
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_data_to_json() -> Result<String, Error> {
    let data = get_all_db_data().await?;
    let json = serde_json::to_string_pretty(&data)
        .context("Failed to serialize data")?;
    
    let backup_dir = backup::get_backup_dir();
    std::fs::create_dir_all(&backup_dir)
        .context("Failed to create backup directory")?;
    
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let export_path = backup_dir.join(format!("export_{}.json", timestamp));
    
    std::fs::write(&export_path, &json)
        .context("Failed to write export file")?;
    
    Ok(export_path.to_string_lossy().to_string())
}
