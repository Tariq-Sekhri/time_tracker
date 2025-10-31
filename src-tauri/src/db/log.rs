use serde::Serialize;
use chrono::{Local, TimeZone};
use sqlx::{SqlitePool, Error};

#[derive(Debug, Serialize)]
pub struct Log {
    pub id: i32,
    pub app: String,
    #[serde(serialize_with = "serialize_timestamp")]
    pub timestamp: u64,
}

#[derive(Debug, Serialize)]
pub struct NewLog {
    pub app: String,
    pub timestamp: u64,
}

fn serialize_timestamp<S>(ts: &u64, ser: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let formatted = Local
        .timestamp_opt(*ts as i64, 0)
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

// - insert
//
// - delete_by_id
//
// - get_all
//
// - get_by_id