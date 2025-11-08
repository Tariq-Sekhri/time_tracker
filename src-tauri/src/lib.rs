mod db;
mod tray;
mod api;
mod core;

use core::{background_process};
use api::{greet, get_cat_regex_cmd, get_logs_cmd, get_categories_cmd,  db_to_json};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pool = tauri::async_runtime::block_on(db::get_pool())
        .expect("Failed to get DB pool");
    tauri::Builder::default()
        .manage(pool)
        .setup(|app| {
            tray::setup_tray(app.handle())?;
            tauri::async_runtime::spawn(background_process());
            Ok(())
        })
        .on_window_event(|_window, event| {
            tray::handle_window_event(_window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, db_to_json, get_cat_regex_cmd, get_logs_cmd, get_categories_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}