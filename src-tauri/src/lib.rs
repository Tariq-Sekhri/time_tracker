mod db;

use std::fmt::Debug;
use db::log::Log;
use db::log;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use chrono::{Local, TimeZone};
use rusqlite::Connection;
use serde_json::{to_string, to_string_pretty};
use tauri::webview::cookie::time::Error::Format;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging as ws;
use crate::db::log::JsonLog;


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)

}



fn generate_log()->Log{
    let hwnd:HWND = unsafe{ ws::GetForegroundWindow()};

    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let fore_ground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now();
    
    println!("{}", fore_ground_window);
    println!("{}", now.duration_since(UNIX_EPOCH).unwrap().as_millis());
    Log::new(None,fore_ground_window, now.duration_since(UNIX_EPOCH).unwrap().as_secs())
 }
//TODO - make this a background process
fn background_process(){
    let conn = match db::open(){
        Ok(conn)=>conn,
        Err(e)=> {eprintln!("Error connecting to database:{e}");return;}
    };

    match  db::create_tables(&conn){
        Ok(())=>println!("Succsesfully created tables"),
        Err(e)=>eprintln!("error creating tables: {e}")
    };



    match log::insert_log(&conn, generate_log()){
        Ok(())=>{println!("Successfully added log to logs table")}
        Err(e) =>{println!("error adding log to logs table: {e}")}
    }
    db_to_json(&conn);
}

fn db_to_json(conn:&Connection){
    let logs:Vec<Log>=match log::get_logs(&conn) {
        Ok( logs)=> logs,
        Err(e)=>{println!("Error getting Logs table: {e}"); return;}
    };



    let json_logs: Vec<JsonLog> = logs
        .iter()
        .map(|log| JsonLog::new(log.id, log.app.clone(), timestamp_to_string(log.timestamp)))
        .collect();
    let mut json_db:String = String::from("{\n");

    match to_string_pretty(&json_logs) {
        Ok(s) => {json_db.push_str(&format!("\"logs\":{s},"));}
        Err(e)=>{println!("Error turn logs into json:{e}");return;}
    }
    json_db.push_str("\n}");
    println!("{json_db}")

}
fn timestamp_to_string(timestamp:u64)->String{
    Local.timestamp_opt(timestamp as i64, 0).single().unwrap().format("%Y-%m-%d %I:%M:%S %p").to_string()

}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    background_process();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
