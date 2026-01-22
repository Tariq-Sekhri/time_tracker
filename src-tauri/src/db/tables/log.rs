use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashMap;

#[derive(Debug, Serialize, FromRow, Clone, Deserialize)]
pub struct Log {
    pub id: i64,
    pub app: String,
    pub timestamp: i64,
    pub duration: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergedLog {
    pub ids: Vec<i64>,
    pub app: String,
    pub timestamp: i64,
    pub duration: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewLog {
    pub app: String,
    pub timestamp: i64,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0
    )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_log(log: NewLog) -> Result<i64, sqlx::Error> {
    let pool = db::get_pool().await?;
    let result = sqlx::query!(
        "INSERT INTO logs (app, timestamp) VALUES (?1, ?2)",
        log.app,
        log.timestamp
    )
    .execute(&pool)
    .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn delete_log_by_id(id: i64) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query!("DELETE FROM logs WHERE id = ?1", id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_logs_by_ids(ids: Vec<i64>) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    for id in ids {
        sqlx::query!("DELETE FROM logs WHERE id = ?1", id)
            .execute(&pool)
            .await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_logs() -> Result<Vec<Log>, Error> {
    let pool = db::get_pool().await?;
    let logs = sqlx::query_as!(Log, "SELECT id, app, timestamp, duration FROM logs")
        .fetch_all(&pool)
        .await?;
    Ok(logs)
}

#[tauri::command]
pub async fn get_log_by_id(id: i64) -> Result<Log, Error> {
    let pool = db::get_pool().await?;
    let log = sqlx::query_as!(Log, "SELECT id, app, timestamp, duration FROM logs WHERE id = ?1", id)
        .fetch_one(&pool)
        .await?;
    Ok(log)
}

pub async fn increase_duration(id: i64) -> Result<(), sqlx::Error> {
    let pool = db::get_pool().await?;
    sqlx::query!("UPDATE logs SET duration = duration + 1 WHERE id = ?1", id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteTimeBlockRequest {
    pub app_names: Vec<String>,
    pub start_time: i64,
    pub end_time: i64,
}

#[tauri::command]
pub async fn delete_logs_for_time_block(request: DeleteTimeBlockRequest) -> Result<i64, Error> {
    let pool = db::get_pool().await?;

    // Get all logs in the time range that match the app names
    let logs = sqlx::query_as!(
        Log,
        "SELECT id, app, timestamp, duration FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2",
        request.start_time,
        request.end_time
    )
    .fetch_all(&pool)
    .await?;

    let mut deleted_count = 0i64;
    for log in logs {
        // Check if the log's app is in the list of app names for this time block
        if request.app_names.contains(&log.app) {
            sqlx::query!("DELETE FROM logs WHERE id = ?1", log.id)
                .execute(&pool)
                .await?;
            deleted_count += 1;
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
pub async fn count_logs_for_time_block(request: DeleteTimeBlockRequest) -> Result<i64, Error> {
    let pool = db::get_pool().await?;

    let logs = sqlx::query_as!(
        Log,
        "SELECT id, app, timestamp, duration FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2",
        request.start_time,
        request.end_time
    )
    .fetch_all(&pool)
    .await?;

    let count = logs
        .iter()
        .filter(|log| request.app_names.contains(&log.app))
        .count();

    Ok(count as i64)
}

#[tauri::command]
pub async fn get_logs_for_time_block(request: DeleteTimeBlockRequest) -> Result<Vec<MergedLog>, Error> {
    let pool = db::get_pool().await?;

    let logs = sqlx::query_as!(
        Log,
        "SELECT id, app, timestamp, duration FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2 ORDER BY duration DESC",
        request.start_time,
        request.end_time
    )
    .fetch_all(&pool)
    .await?;

    let filtered_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| request.app_names.contains(&log.app))
        .collect();

    Ok(merge_logs_in_time_block(filtered_logs))
}

fn merge_logs_in_time_block(logs: Vec<Log>) -> Vec<MergedLog> {
    let mut app_map: HashMap<String, MergedLog> = HashMap::new();
    for log in logs {
        if let Some(existing) = app_map.get_mut(&log.app) {
            existing.duration += log.duration;
            existing.ids.push(log.id);
            // Keep the earliest timestamp
            if log.timestamp < existing.timestamp {
                existing.timestamp = log.timestamp;
            }
        } else {
            app_map.insert(log.app.clone(), MergedLog {
                ids: vec![log.id],
                app: log.app,
                timestamp: log.timestamp,
                duration: log.duration,
            });
        }
    }
    app_map.into_values().collect()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetLogsByCategoryRequest {
    pub category: String,
    pub start_time: i64,
    pub end_time: i64,
}

#[tauri::command]
pub async fn get_logs_by_category(request: GetLogsByCategoryRequest) -> Result<Vec<MergedLog>, Error> {
    use crate::db::tables::{cat_regex, category, skipped_app};
    use cat_regex::get_cat_regex;
    use category::get_categories;
    use skipped_app::get_skipped_apps;
    use regex::Regex;
    use std::collections::HashMap;

    let pool = db::get_pool().await?;

    // Get all logs in the time range
    let mut logs = sqlx::query_as!(
        Log,
        "SELECT id, app, timestamp, duration FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2 ORDER BY duration DESC",
        request.start_time,
        request.end_time
    )
    .fetch_all(&pool)
    .await?;

    // Filter skipped apps (similar to statistics.rs)
    let skipped_apps = get_skipped_apps().await?;
    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| Regex::new(&app.regex).ok())
        .collect();

    let is_skipped =
        |app_name: &str| -> bool { skipped_regexes.iter().any(|regex| regex.is_match(app_name)) };

    logs.retain(|log| !is_skipped(&log.app));

    // Get categories and regex patterns to determine which apps belong to the category
    let categories = get_categories().await?;
    let cat_regex_list = get_cat_regex().await?;

    // Build regex table (similar to statistics.rs)
    let category_map: HashMap<i32, &category::Category> =
        categories.iter().map(|cat| (cat.id, cat)).collect();

    let mut regex_list: Vec<(Regex, String)> = cat_regex_list
        .iter()
        .filter_map(|reg| {
            let cat = category_map.get(&reg.cat_id)?;
            let compiled_regex = Regex::new(&reg.regex).ok()?;
            Some((compiled_regex, cat.name.clone()))
        })
        .collect();

    // Sort by priority (higher priority first)
    regex_list.sort_by_key(|(_, cat_name)| {
        categories
            .iter()
            .find(|c| c.name == *cat_name)
            .map(|c| std::cmp::Reverse(c.priority))
            .unwrap_or(std::cmp::Reverse(0))
    });

    // Filter logs by category
    let filtered_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| {
            // Find the first matching regex
            let matched_category = regex_list
                .iter()
                .find(|(regex, _)| regex.is_match(&log.app))
                .map(|(_, cat_name)| cat_name.clone())
                .unwrap_or_else(|| "Miscellaneous".to_string());
            
            matched_category == request.category
        })
        .collect();

    Ok(merge_logs_in_time_block(filtered_logs))
}
