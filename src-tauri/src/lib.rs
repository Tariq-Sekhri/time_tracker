#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]
mod db;
mod tray;

use std::fmt::Debug;
use std::{thread, time};
use std::thread::Thread;
use db::log::Log;
use db::log;
use db::category::Category;
use db::category;
use db::cat_regex::CategoryRegex;
use db::cat_regex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use chrono::{Local, TimeZone};
use serde_json::{json, to_string_pretty};
use windows::Win32::UI::WindowsAndMessaging as ws;
use db::log::NewLog;
use crate::db::log::increase_duration;
use log::get_logs;
use category::get_categories;
use cat_regex::get_cat_regex;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}



fn generate_log()->NewLog{
    let hwnd = unsafe{ ws::GetForegroundWindow()};


    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let fore_ground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now();

    // println!("{}", fore_ground_window);
    // println!("{}", now.duration_since(UNIX_EPOCH).unwrap().as_secs());
     NewLog{app:fore_ground_window, timestamp:now.duration_since(UNIX_EPOCH).unwrap().as_secs() as i64}
 }

#[tauri::command]
async fn db_to_json() -> String{
    println!("db to json called");
    let pool = match db::get_pool().await {
        Ok(pool) => pool,
        Err(e) => return format!("Error connecting to database: {e}"),
    };
    let logs: Vec<Log> = match get_logs(&pool).await {
        Ok(logs) => logs,
        Err(e) => return format!("Error getting Logs table: {e}"),
    };

    let categories: Vec<Category> = match get_categories(&pool).await {
        Ok(category)=>category,
        Err(e)=>return format!("Error getting category table: {e}"),
    };

    let cat_regex : Vec<CategoryRegex> = match get_cat_regex(&pool).await{
        Ok(cat_regex)=>cat_regex,
        Err(e)=>return format!("Error getting Category Regex table: {e}"),

    };
    let mut json_db:String = String::from("{\n");

    match to_string_pretty(&logs) {
        Ok(s) => {json_db.push_str(&format!("\"logs\":{s},\n"));}
        Err(e)=>{return format!("Error turn logs into json:{e}");}
    }
    match to_string_pretty(&categories){
        Ok(cat)=>{json_db.push_str(&format!("\"Category\":{cat},\n"))},
        Err(e)=>{return format!("error turning categories into json: {e}")}
    }
    match to_string_pretty(&cat_regex){
        Ok(reg)=>{json_db.push_str(&format!("\"Category_Regex\":{reg}\n"))},
        Err(e)=>{return format!("error turning category regex into json: {e}")}
    }

    json_db.push_str("\n}");

    println!("{json_db}");
    println!("db to json called");
    json_db
}

async fn background_process(){
    let pool = match db::get_pool().await {
        Ok(pool)=>pool,
        Err(e)=>{eprintln!("Error: {e}"); return}
    };
    let mut last_log_id  = -1;
    loop{
        let new_log = generate_log();
        if last_log_id==-1{
            last_log_id = log::insert(pool, new_log ).await.expect("TODO: panic message");
        }else{
            match log::get_by_id(pool,last_log_id).await {
                Ok(last_log)=>{
                    if last_log.app== new_log.app {
                        increase_duration(pool, last_log.id).await.expect("increase");
                    }else{
                        last_log_id =  log::insert(pool, new_log ).await.expect("last_log");
                    }
                },
                Err(e)=> {eprintln!("Error getting log {e}"); return}
            };

        }

        tokio::time::sleep(Duration::from_secs(1)).await;
    }



}
#[tauri::command]
async fn get_cat_regex_cmd()->String{
     match db::get_pool().await {
        Ok(pool)=>{
            match get_cat_regex(pool).await {
                Ok(cat_regex)=>{
                    to_string_pretty(&cat_regex).unwrap().to_string()
                },
                Err(e)=>{ format!("Error: {e}")}

            }
        },
        Err(e)=>{ format!("Error: {e}")}
    }
}

#[tauri::command]
async fn get_logs_cmd() -> String {
    match db::get_pool().await {
        Ok(pool) => {
            match get_logs(&pool).await {
                Ok(logs) => {
                    to_string_pretty(&logs).unwrap().to_string()
                },
                Err(e) => { format!("Error: {e}") }
            }
        },
        Err(e) => { format!("Error: {e}") }
    }
}

#[tauri::command]
async fn get_categories_cmd() -> String {
    match db::get_pool().await {
        Ok(pool) => {
            match get_categories(&pool).await {
                Ok(categories) => {
                    to_string_pretty(&categories).unwrap().to_string()
                },
                Err(e) => { format!("Error: {e}") }
            }
        },
        Err(e) => { format!("Error: {e}") }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Add tray setup here
            tray::setup_tray(app.handle())?;
            tauri::async_runtime::spawn(background_process());
            Ok(())
        })
        .on_window_event(|_window, event| {
            // Add window event handler
            tray::handle_window_event(_window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, db_to_json, get_cat_regex_cmd, get_logs_cmd, get_categories_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}