mod api;
mod core;
mod db;
mod tray;
use api::*;
use core::background_process;
use db::cat_regex::{
    delete_cat_regex_by_id, get_cat_regex, get_cat_regex_by_id, insert_cat_regex,
    update_cat_regex_by_id,
};
use db::category::{
    delete_category_by_id, get_categories, get_category_by_id, insert_category,
    update_category_by_id,
};
use db::log::{delete_log_by_id, get_log_by_id, get_logs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    //    let pool = tauri::async_runtime::block_on(db::get_pool()).expect("Failed to get DB pool");
    tauri::Builder::default()
        // .manage(pool)
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
