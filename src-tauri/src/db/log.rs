use rusqlite::{params, Connection, Result};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Log {
    pub id: Option<i32>,
    pub app: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize)]
pub struct JsonLog {
    pub id: Option<i32>,
    pub app: String,
    pub timestamp: String,
}

impl Log {
    pub fn new(id:Option<i32>, app: String, timestamp: u64) -> Self {
        Log {
            id,
            app,
            timestamp,
        }
    }
}
impl JsonLog {
    pub fn new(id:Option<i32>, app: String, timestamp:String ) -> Self {
        JsonLog {
            id,
            app,
            timestamp,
        }
    }
}





pub fn create_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS logs (
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
        "insert into logs (app, timestamp) VALUES (?,?)" ,
        params![log.app, log.timestamp.to_string()]
    )?;
    Ok(())
}

pub fn get_logs(conn: &Connection) -> Result<Vec<Log>> {
    let mut stmt = conn.prepare("SELECT id, app, timestamp FROM logs")?;

    let logs_iter = stmt.query_map([], |row| {
        let timestamp_str: String = row.get(2)?;
        Ok(Log {
            id: row.get(0)?,
            app: row.get(1)?,
            timestamp: timestamp_str.parse::<u64>().unwrap(),
        })
    })?;
    let logs: Vec<Log> = logs_iter.filter_map(|r| r.ok()).collect();
    Ok(logs)
}

//TODO - Add the ability to delete a range of logs