mod db;
use db::log::Log;
use db::log;
use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::Connection;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging as ws;
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
    Log::new(None,fore_ground_window, now.duration_since(UNIX_EPOCH).unwrap().as_millis())
 }
//TODO - make this a background process
fn background_process(){
    let ret = db::open();
    if let Err(e) =&ret {
        eprintln!("DB error: {e}");
    }
    let conn:Connection = ret.unwrap();
    let create_table_result = log::create_table(&conn);
    match create_table_result{
        Ok(())=>{println!("Successfully created log table ")}
        Err(e) =>{println!("error creating log table: {e}")}
    }
    let log:Log = generate_log();
    let result = log::insert_log(&conn, log);

    match result{
        Ok(())=>{println!("Successfully added log to log_model")}
        Err(e) =>{println!("error adding log to log_model: {e}")}
    }
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
