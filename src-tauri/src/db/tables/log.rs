use crate::db;
use crate::db::AppError as Error;
use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

pub static SKIPPED_APPS: [&str; 7] = [
    "",
    "Windows Default Lock Screen",
    "Task View",
    "Search",
    "Task Switching",
    "System tray overflow window.",
    "Program Manager",
];

#[derive(Debug, Serialize, FromRow, Clone, Deserialize)]
pub struct Log {
    pub id: i64,
    pub app: String,
    #[serde(serialize_with = "serialize_timestamp")]
    pub timestamp: i64,
    pub duration: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewLog {
    pub app: String,
    pub timestamp: i64,
}

pub fn serialize_timestamp<S>(ts: &i64, ser: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let formatted = Local
        .timestamp_opt(*ts, 0)
        .single()
        .ok_or_else(|| serde::ser::Error::custom(format!("Invalid timestamp: {}", ts)))?
        .format("%Y-%m-%d %I:%M:%S %p")
        .to_string();
    ser.serialize_str(&formatted)
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
        .execute(pool)
        .await?;
    Ok(result.last_insert_rowid())
}
#[tauri::command]

pub async fn delete_log_by_id(id: i64) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("DELETE FROM logs WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
#[tauri::command]

pub async fn get_logs() -> Result<Vec<Log>, Error> {
    let pool = db::get_pool().await?;
    let logs = sqlx::query_as::<_, Log>("SELECT * FROM logs")
        .fetch_all(pool)
        .await?;
    Ok(logs)
}
#[tauri::command]

pub async fn get_log_by_id(id: i64) -> Result<Log, Error> {
    let pool = db::get_pool().await?;
    let log = sqlx::query_as::<_, Log>("SELECT * FROM logs WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await?;
    Ok(log)
}

pub async fn increase_duration(id: i64) -> Result<(), sqlx::Error> {
    let pool = db::get_pool().await?;
    sqlx::query("UPDATE logs SET duration = duration + 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
