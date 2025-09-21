use std::fs;
use rusqlite::{params, Connection, Result};
use crate::log::Log;
const PATH_FOLDER: &str = "../data";
const PATH: &str = "../data/app.db";

pub fn open() -> Result<Connection, Box<dyn std::error::Error>> {
    fs::create_dir_all(PATH_FOLDER)?;
    Ok(Connection::open(PATH)?)
}
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

pub fn drop_all()->std::io::Result<()>{
    fs::remove_file(PATH)?;
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