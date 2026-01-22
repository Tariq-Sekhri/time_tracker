#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]

pub mod error;
pub mod pool;
pub mod queries;
pub(crate) mod tables;

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
    let pool = get_pool().await?;

    // Delete all data from all tables
    sqlx::query!("DELETE FROM logs").execute(&pool).await?;
    sqlx::query!("DELETE FROM category_regex").execute(&pool).await?;
    sqlx::query!("DELETE FROM category").execute(&pool).await?;
    sqlx::query!("DELETE FROM skipped_apps").execute(&pool).await?;

    // Re-run table creation which will insert defaults
    tables::category::create_table(&pool)
        .await
        .map_err(|e| Error::Db(e.to_string()))?;
    tables::cat_regex::create_table(&pool)
        .await
        .map_err(|e| Error::Db(e.to_string()))?;
    tables::skipped_app::create_table(&pool)
        .await
        .map_err(|e| Error::Db(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub async fn reset_database() -> Result<(), Error> {
    reset_pool().await.map_err(|e| Error::Db(e.to_string()))?;
    pool::drop_all().map_err(|e| Error::Db(format!("Failed to delete database file: {}", e)))?;
    get_pool().await.map_err(|e| Error::Db(e.to_string()))?;
    Ok(())
}
