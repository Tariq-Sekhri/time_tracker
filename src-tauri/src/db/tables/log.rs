use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Clone, Deserialize)]
pub struct Log {
    pub id: i64,
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
    let result = sqlx::query("INSERT INTO logs (app, timestamp) VALUES (?, ?)")
        .bind(log.app)
        .bind(log.timestamp)
        .execute(&pool)
        .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn delete_log_by_id(id: i64) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("DELETE FROM logs WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_logs() -> Result<Vec<Log>, Error> {
    let pool = db::get_pool().await?;
    let logs = sqlx::query_as::<_, Log>("SELECT * FROM logs")
        .fetch_all(&pool)
        .await?;
    Ok(logs)
}

#[tauri::command]
pub async fn get_log_by_id(id: i64) -> Result<Log, Error> {
    let pool = db::get_pool().await?;
    let log = sqlx::query_as::<_, Log>("SELECT * FROM logs WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await?;
    Ok(log)
}

pub async fn increase_duration(id: i64) -> Result<(), sqlx::Error> {
    let pool = db::get_pool().await?;
    sqlx::query("UPDATE logs SET duration = duration + 1 WHERE id = ?")
        .bind(id)
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
    let logs =
        sqlx::query_as::<_, Log>("SELECT * FROM logs WHERE timestamp >= ? AND timestamp <= ?")
            .bind(request.start_time)
            .bind(request.end_time)
            .fetch_all(&pool)
            .await?;

    let mut deleted_count = 0i64;
    for log in logs {
        // Check if the log's app is in the list of app names for this time block
        if request.app_names.contains(&log.app) {
            sqlx::query("DELETE FROM logs WHERE id = ?")
                .bind(log.id)
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

    let logs =
        sqlx::query_as::<_, Log>("SELECT * FROM logs WHERE timestamp >= ? AND timestamp <= ?")
            .bind(request.start_time)
            .bind(request.end_time)
            .fetch_all(&pool)
            .await?;

    let count = logs
        .iter()
        .filter(|log| request.app_names.contains(&log.app))
        .count();

    Ok(count as i64)
}

#[tauri::command]
pub async fn get_logs_for_time_block(request: DeleteTimeBlockRequest) -> Result<Vec<Log>, Error> {
    let pool = db::get_pool().await?;

    let logs = sqlx::query_as::<_, Log>(
        "SELECT * FROM logs WHERE timestamp >= ? AND timestamp <= ? ORDER BY duration DESC",
    )
    .bind(request.start_time)
    .bind(request.end_time)
    .fetch_all(&pool)
    .await?;

    let filtered_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| request.app_names.contains(&log.app))
        .collect();

    Ok(filtered_logs)
}
