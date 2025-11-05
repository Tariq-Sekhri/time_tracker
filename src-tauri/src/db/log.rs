use serde::Serialize;
use chrono::{Local, TimeZone};
use sqlx::{SqlitePool, Error, FromRow};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, FromRow,Clone)]
pub struct Log {
    pub id: i64,
    pub app: String,
    #[serde(serialize_with = "serialize_timestamp")]
    pub timestamp: i64,
    pub duration:i64
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
            timestamp INTEGER NOT NULL,
            duration INTEGER NOT NULL default 0
        )"
    )
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert(pool: &SqlitePool,log: NewLog) -> Result<i64, Error> {
   let result =  sqlx::query("INSERT INTO logs (app, timestamp) VALUES (?, ?)")
        .bind(log.app)
        .bind(log.timestamp.to_string())
        .execute(pool)
        .await?;

    Ok(result.last_insert_rowid())
}

pub async fn delete_by_id(pool: &SqlitePool, id: i64) -> Result<(), Error> {
    sqlx::query("DELETE FROM logs WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_all(pool: &SqlitePool) -> Result<Vec<Log>, Error> {
    sqlx::query_as::<_, Log>("SELECT *  FROM logs")
        .fetch_all(pool)
        .await
}
pub async fn get_by_id(pool: &SqlitePool,id:i64 )->Result<Log, Error>{
    sqlx::query_as::<_, Log>("select * from logs where id = ?")
        .bind(id).fetch_one(pool).await
}
pub async fn increase_duration(pool: &SqlitePool, id: i64) -> Result<(), Error> {
    sqlx::query("update logs set duration = duration + 1 where id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}