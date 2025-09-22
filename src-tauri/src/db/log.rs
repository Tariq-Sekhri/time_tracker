#[derive(Debug)]
pub struct Log {
    pub id: Option<i32>,
    pub app: String,
    pub timestamp: u128,
}

impl Log {
    pub fn new(id:Option<i32>, app: String, timestamp: u128) -> Self {
        Log {
            id,
            app,
            timestamp,
        }
    }
}

use std::fs;
use rusqlite::{params, Connection, Result};




pub fn create_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}



pub fn insert_log(conn:&Connection, log:Log) ->Result<()>{
    conn.execute(
        "insert into log (app, timestamp) VALUES (?,?)" ,
        params![log.app, log.timestamp.to_string()]
    )?;
    Ok(())
}

pub fn get_logs(conn: &Connection) -> Result<Vec<Log>> {
    let mut stmt = conn.prepare("SELECT id, app, timestamp FROM log")?;

    let logs_iter = stmt.query_map([], |row| {
        let timestamp_str: String = row.get(2)?;
        Ok(Log {
            id: row.get(0)?,
            app: row.get(1)?,
            timestamp: timestamp_str.parse::<u128>().unwrap(),
        })
    })?;
    let logs: Vec<Log> = logs_iter.filter_map(|r| r.ok()).collect();
    Ok(logs)
}