use std::fmt::Debug;
use std::{fs, thread};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging as ws;

use rusqlite::{params, Connection, Result};
use serde::Serialize;

fn main() {
    println!("Starting: opening connection...");
    let conn = match open() {
        Ok(conn) => {
            println!("Connection opened successfully.");
            conn
        }
        Err(err) => {
            eprintln!("Error occurred opening connection: {err}");
            return;
        }
    };

    println!("Creating table if not exists...");
    match create_table(&conn) {
        Ok(_) => println!("Table ready."),
        Err(e) => eprintln!("Error making table: {e}"),
    }

    let mut a = true;
    println!("Entering loop. Will alternate insert/sleep: a flips each iteration.");
    loop {
        a = !a;
        println!("Loop tick. a = {a}");

        if a {
            let log = generate_log();
            println!("Inserting log: {:?}", log);
            match insert_log(&conn, log) {
                Ok(_) => println!("Insert OK."),
                Err(err) => eprintln!("Error inserting log: {err}"),
            }
            println!("Sleeping 1s...");
            thread::sleep(Duration::from_secs(1));
        } else {
            println!("Skipping insert this tick. Sleeping 10s...");
            thread::sleep(Duration::from_secs(10));
        }
    }
}
const PATH_FOLDER: &str = "../data";
const PATH: &str = "../data/app.db";
pub fn open() -> rusqlite::Result<Connection, Box<dyn std::error::Error>> {
    fs::create_dir_all(PATH_FOLDER)?;
    Ok(Connection::open(PATH)?)
}

fn generate_log()->Log{
    let hwnd:HWND = unsafe{ ws::GetForegroundWindow()};

    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let fore_ground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now();

    println!("{}", fore_ground_window);
    println!("{}", now.duration_since(UNIX_EPOCH).unwrap().as_secs());
    Log::new(None,fore_ground_window, now.duration_since(UNIX_EPOCH).unwrap().as_secs())
}
#[derive(Debug, Serialize)]
pub struct Log {
    pub id: Option<i32>,
    pub app: String,
    pub timestamp: u64,
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


