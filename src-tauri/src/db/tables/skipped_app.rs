use crate::db;
use crate::db::AppError as Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct SkippedApp {
    pub id: i32,
    pub app_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewSkippedApp {
    app_name: String,
}

const DEFAULT_SKIPPED_APPS: [&str; 7] = [
    "",
    "Windows Default Lock Screen",
    "Task View",
    "Search",
    "Task Switching",
    "System tray overflow window.",
    "Program Manager",
];

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS skipped_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_name TEXT NOT NULL UNIQUE
        );",
    )
    .execute(pool)
    .await?;

    // Insert default skipped apps if table is empty
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM skipped_apps")
        .fetch_one(pool)
        .await?;

    if count.0 == 0 {
        for app_name in DEFAULT_SKIPPED_APPS.iter() {
            sqlx::query("INSERT OR IGNORE INTO skipped_apps (app_name) VALUES (?)")
                .bind(app_name)
                .execute(pool)
                .await?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_skipped_apps() -> Result<Vec<SkippedApp>, Error> {
    let pool = db::get_pool().await?;
    let apps = sqlx::query_as::<_, SkippedApp>("SELECT * FROM skipped_apps ORDER BY app_name")
        .fetch_all(pool)
        .await?;
    Ok(apps)
}

#[tauri::command]
pub async fn insert_skipped_app(new_app: NewSkippedApp) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    Ok(
        sqlx::query("INSERT INTO skipped_apps (app_name) VALUES (?)")
            .bind(new_app.app_name)
            .execute(pool)
            .await?
            .last_insert_rowid(),
    )
}

#[tauri::command]
pub async fn delete_skipped_app_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("DELETE FROM skipped_apps WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_skipped_app_by_name(app_name: &str) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("DELETE FROM skipped_apps WHERE app_name = ?")
        .bind(app_name)
        .execute(pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn is_skipped_app(app_name: &str) -> Result<bool, Error> {
    let pool = db::get_pool().await?;
    let result: Option<(i32,)> = sqlx::query_as("SELECT id FROM skipped_apps WHERE app_name = ?")
        .bind(app_name)
        .fetch_optional(pool)
        .await?;
    Ok(result.is_some())
}

