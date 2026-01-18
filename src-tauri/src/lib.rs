mod core;
mod db;
mod tray;

use core::{get_tracking_status, set_tracking_status, supervisor};
use db::queries::{get_day_statistics, get_week, get_week_statistics};
use db::tables::cat_regex::{
    delete_cat_regex_by_id, get_cat_regex, get_cat_regex_by_id, insert_cat_regex,
    update_cat_regex_by_id,
};
use db::tables::category::{
    delete_category_by_id, get_categories, get_category_by_id, insert_category,
    update_category_by_id,
};
use db::tables::log::{
    count_logs_for_time_block, delete_log_by_id, delete_logs_for_time_block, get_log_by_id,
    get_logs, get_logs_for_time_block,
};
use db::tables::skipped_app::{
    count_matching_logs, delete_skipped_app_by_id, get_skipped_apps,
    insert_skipped_app_and_delete_logs, restore_default_skipped_apps, update_skipped_app_by_id,
};
use db::{get_all_db_data, get_db_path_cmd, reset_database, wipe_all_data};
use tauri::Manager;
use tray::refresh_tray_menu;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Todo if running in dev disable this using cfg stuff
            if let Some(window) = app.get_window("main") {
                #[cfg(debug_assertions)]
                let _ = window.show();

                #[cfg(not(debug_assertions))]
                let _ = window.hide();
            }

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
            get_week_statistics,
            get_day_statistics,
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
            delete_logs_for_time_block,
            count_logs_for_time_block,
            get_logs_for_time_block,
            get_skipped_apps,
            insert_skipped_app_and_delete_logs,
            update_skipped_app_by_id,
            delete_skipped_app_by_id,
            count_matching_logs,
            restore_default_skipped_apps,
            get_db_path_cmd,
            get_all_db_data,
            wipe_all_data,
            reset_database,
            get_tracking_status,
            set_tracking_status,
            refresh_tray_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
