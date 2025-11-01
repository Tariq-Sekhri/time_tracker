use serde::Serialize;
use chrono::{Local, TimeZone};
use sqlx::{SqlitePool, Error, FromRow};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, FromRow)]
pub struct Log {
    pub id: i32,
    pub app: String,
    #[serde(serialize_with = "serialize_timestamp")]
    pub timestamp: i64,
}

#[derive(Debug, Serialize)]
pub struct NewLog {
    pub app: String,
    pub timestamp: i64,
}

fn serialize_timestamp<S>(ts: &i64, ser: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let formatted = Local
        .timestamp_opt(*ts, 0)
        .single()
        .unwrap()
        .format("%Y-%m-%d %I:%M:%S %p")
        .to_string();
    ser.serialize_str(&formatted)
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )"
    )
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert(log: NewLog, pool: &SqlitePool) -> Result<(), Error> {
    sqlx::query("INSERT INTO logs (app, timestamp) VALUES (?, ?)")
        .bind(log.app)
        .bind(log.timestamp.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_by_id(pool: &SqlitePool, id: i32) -> Result<(), Error> {
    sqlx::query("DELETE FROM logs WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_all(pool: &SqlitePool) -> Result<Vec<Log>, Error> {
    sqlx::query_as::<_, Log>("SELECT id, app, timestamp FROM logs")
        .fetch_all(pool)
        .await
}

