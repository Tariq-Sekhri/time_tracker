#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]

pub mod error;
pub mod pool;
pub mod queries;
pub(crate) mod tables;

use serde::Serialize;
use tables::cat_regex::{get_cat_regex, CategoryRegex};
use tables::category::{get_categories, Category};
use tables::log::{get_logs, Log};
use tables::skipped_app::{get_skipped_apps, SkippedApp};

pub use error::AppError;
pub use pool::get_pool;
pub use queries::get_week;

#[derive(Serialize)]
pub struct AllDbData {
    pub logs: Vec<Log>,
    pub categories: Vec<Category>,
    pub category_regex: Vec<CategoryRegex>,
    pub skipped_apps: Vec<SkippedApp>,
}

#[tauri::command]
pub async fn get_all_db_data() -> Result<AllDbData, AppError> {
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
    pool::get_db_path().to_string_lossy().to_string()
}
