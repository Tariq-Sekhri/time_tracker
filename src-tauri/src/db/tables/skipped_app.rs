use crate::db;
use crate::db::tables::log::get_logs;
use crate::db::Error;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct SkippedApp {
    pub id: i32,
    pub regex: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewSkippedApp {
    pub regex: String,
}

const DEFAULT_SKIPPED_APPS: [&str; 7] = [
    "^$",
    "^Windows Default Lock Screen$",
    "^Task View$",
    "^Search$",
    "^Task Switching$",
    "^System tray overflow window\\.$",
    "^Program Manager$",
];

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS skipped_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            regex TEXT NOT NULL UNIQUE
        );",
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_skipped_apps() -> Result<Vec<SkippedApp>, Error> {
    let pool = db::get_pool().await?;
    let apps = sqlx::query_as!(
        SkippedApp,
        r#"SELECT id as "id!: i32", regex FROM skipped_apps ORDER BY regex"#
    )
    .fetch_all(&pool)
    .await?;
    Ok(apps)
}

#[tauri::command]
pub async fn count_matching_logs(regex_pattern: String) -> Result<i64, Error> {
    let compiled_regex = Regex::new(&regex_pattern).map_err(|e| Error::Regex(e.to_string()))?;
    let logs = get_logs().await?;
    let count = logs
        .iter()
        .filter(|log| compiled_regex.is_match(&log.app))
        .count();
    Ok(count as i64)
}

#[tauri::command]
pub async fn insert_skipped_app_and_delete_logs(new_app: NewSkippedApp) -> Result<i64, Error> {
    let compiled_regex = Regex::new(&new_app.regex).map_err(|e| Error::Regex(e.to_string()))?;
    let pool = db::get_pool().await?;
    let logs = get_logs().await?;
    let matching_ids: Vec<i64> = logs
        .iter()
        .filter(|log| compiled_regex.is_match(&log.app))
        .map(|log| log.id)
        .collect();

    if !matching_ids.is_empty() {
        let mut tx = (&pool).begin().await?;
        for log_id in matching_ids {
            sqlx::query!("DELETE FROM logs WHERE id = ?1", log_id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
    }

    let result = sqlx::query!("INSERT INTO skipped_apps (regex) VALUES (?1)", new_app.regex)
        .execute(&pool)
        .await?;
    let id = result.last_insert_rowid();

    Ok(id)
}

#[tauri::command]
pub async fn update_skipped_app_by_id(skipped_app: SkippedApp) -> Result<(), Error> {
    Regex::new(&skipped_app.regex).map_err(|e| Error::Regex(e.to_string()))?;
    let pool = db::get_pool().await?;
    sqlx::query!(
        "UPDATE skipped_apps SET regex = ?1 WHERE id = ?2",
        skipped_app.regex,
        skipped_app.id
    )
    .execute(&pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_skipped_app_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query!("DELETE FROM skipped_apps WHERE id = ?1", id)
        .execute(&pool)
        .await?;
    Ok(())
}

pub async fn is_skipped_app(app_name: &str) -> Result<bool, Error> {
    let pool = db::get_pool().await?;
    let skipped_apps = sqlx::query_as!(
        SkippedApp,
        r#"SELECT id as "id!: i32", regex FROM skipped_apps"#
    )
        .fetch_all(&pool)
        .await?;

    for skipped in skipped_apps {
        if let Ok(regex) = Regex::new(&skipped.regex) {
            if regex.is_match(app_name) {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

#[tauri::command]
pub async fn restore_default_skipped_apps() -> Result<(), Error> {
    let pool = db::get_pool().await?;
    for regex_pattern in DEFAULT_SKIPPED_APPS.iter() {
        sqlx::query!("INSERT OR IGNORE INTO skipped_apps (regex) VALUES (?1)", *regex_pattern)
            .execute(&pool)
            .await?;
    }

    Ok(())
}
