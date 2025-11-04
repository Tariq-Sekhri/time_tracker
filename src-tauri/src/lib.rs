#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]
mod db;

use std::fmt::Debug;
use db::log::Log;
use db::log;
use db::category::Category;
use db::category;
use db::cat_regex::CategoryRegex;
use db::cat_regex;
use std::time::{ SystemTime, UNIX_EPOCH};
use chrono::{Local, TimeZone};
use serde_json::to_string_pretty;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging as ws;
use db::log::NewLog;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}



fn generate_log()->NewLog{
    let hwnd:HWND = unsafe{ ws::GetForegroundWindow()};

    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let fore_ground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now();

    println!("{}", fore_ground_window);
    println!("{}", now.duration_since(UNIX_EPOCH).unwrap().as_secs());
     NewLog{app:fore_ground_window, timestamp:now.duration_since(UNIX_EPOCH).unwrap().as_secs() as i64}
 }

// #[tauri::command]
// async fn db_to_json() -> String{
//     let pool = match db::get_pool().await {
//         Ok(pool) => pool,
//         Err(e) => return format!("Error connecting to database: {e}"),
//     };
//     let logs: Vec<Log> = match log::get_all(&pool).await {
//         Ok(logs) => logs,
//         Err(e) => return format!("Error getting Logs table: {e}"),
//     };
//
//
//     let json_logs: Vec<JsonLog> = logs
//         .iter()
//         .map(|log| JsonLog::new(log.id, log.app.clone(), timestamp_to_string(log.timestamp)))
//         .collect();
//     let categories :Vec<Category> =match category::get_all(&conn){
//         Ok(cat)=>{cat},
//         Err(e)=>{return format!("Erorr getting categories: {e}");}
//     };
//
//     let cat_regex:Vec<CategoryRegex> = match cat_regex::get_all(&conn){
//         Ok(cat_regex)=>{cat_regex},
//         Err(e)=>{return format!("Error getting all cat regex: {e}"); }
//     };
//
//     let mut json_db:String = String::from("{\n");
//
//     match to_string_pretty(&json_logs) {
//         Ok(s) => {json_db.push_str(&format!("\"logs\":{s},\n"));}
//         Err(e)=>{return format!("Error turn logs into json:{e}");}
//     }
//     match to_string_pretty(&categories){
//         Ok(cat)=>{json_db.push_str(&format!("\"Category\":{cat},\n"))},
//         Err(e)=>{return format!("error turning categories into json: {e}")}
//     }
//     match to_string_pretty(&cat_regex){
//         Ok(reg)=>{json_db.push_str(&format!("\"Category_Regex\":{reg}\n"))},
//         Err(e)=>{return format!("error turning category regex into json: {e}")}
//     }
//
//     json_db.push_str("\n}");
//
//     // println!("{json_db}")
//     println!("db to json called");
//     return json_db;
// }



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // background_process();
    println!("before");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    println!("after");
}
