mod db;

use std::fs;
use std::path::PathBuf;

use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{params, Connection};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging as ws;
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


fn generate_log(){
    let hwnd:HWND = unsafe{ ws::GetForegroundWindow()};

    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let fore_ground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now();
    
    println!("{}", fore_ground_window);
    println!("{}", now.duration_since(UNIX_EPOCH).unwrap().as_millis());
 }


use std::error::Error;

fn db() -> Result<(), Box<dyn Error>> {
    fs::create_dir_all("../data")?;
    let conn = Connection::open("../data/app.db")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, name TEXT)",
        [],
    )?;
    conn.execute("INSERT INTO t (name) VALUES (?)", params!["Alice"])?;
    let mut stmt = conn.prepare("SELECT id, name FROM t")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (id, name) = row?;
        println!("{id}: {name}");
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = db() {
        eprintln!("DB error: {e}");
    }
    generate_log();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
