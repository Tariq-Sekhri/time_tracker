mod api;
mod core;
mod db;
mod tray;

use api::*;
use core::background_process;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pool = tauri::async_runtime::block_on(db::get_pool()).expect("Failed to get DB pool");
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
        .invoke_handler(tauri::generate_handler![
            get_cat_regex_cmd,
            get_logs_cmd,
            get_categories_cmd,
            get_week
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
