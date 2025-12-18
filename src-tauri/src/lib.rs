mod core;
mod db;
mod tray;

use core::supervisor;
use db::queries::get_week;
use db::tables::cat_regex::{
    delete_cat_regex_by_id, get_cat_regex, get_cat_regex_by_id, insert_cat_regex,
    update_cat_regex_by_id,
};
use db::tables::category::{
    delete_category_by_id, get_categories, get_category_by_id, insert_category,
    update_category_by_id,
};
use db::tables::log::{delete_log_by_id, get_log_by_id, get_logs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            tray::setup_tray(app.handle())?;
            tauri::async_runtime::spawn(supervisor(app.handle().clone()));
            Ok(())
        })
        .on_window_event(|_window, event| {
            tray::handle_window_event(_window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_categories,
            get_week,
            delete_category_by_id,
            get_category_by_id,
            insert_category,
            update_category_by_id,
            get_cat_regex,
            get_cat_regex_by_id,
            delete_cat_regex_by_id,
            insert_cat_regex,
            update_cat_regex_by_id,
            get_logs,
            get_log_by_id,
            delete_log_by_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
