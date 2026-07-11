mod app_prefs;
mod commands;
mod core;
mod db;
mod google_oauth;
mod instance;
mod sync;
mod tray;

use commands::{apply_update_cmd, check_update_cmd};
use core::{get_tracking_status, set_tracking_status, supervisor};
use db::queries::{
    get_day_statistics, get_total_statistics, get_week, get_week_for_app_filter,
    get_week_statistics,
};
use db::tables::app_metadata_kv::{get_server_ip, set_server_ip};
use db::tables::cat_regex::{
    delete_cat_regex_by_id, get_cat_regex, get_cat_regex_by_id, insert_cat_regex,
    update_cat_regex_by_id,
};
use db::tables::category::{
    delete_category_by_id, get_categories, get_category_by_id, insert_category,
    update_category_by_id,
};
use db::tables::device::{get_local_device_name, insert_devices, set_is_tracking, update_device};
use db::tables::google_calendar::{
    delete_google_calendar, get_google_calendar_by_id, get_google_calendars,
    insert_google_calendar, update_google_calendar,
};
use db::tables::log::{
    count_logs_for_time_block, delete_log_by_id, delete_logs_by_ids, delete_logs_for_time_block,
    get_log_by_id, get_logs, get_logs_by_category, get_logs_for_app_in_time_range,
    get_logs_for_time_block,
};
use db::tables::settings::{flip_lock_by_key, get_settings, reset_val_by_key, update_val_by_key};
use db::tables::skipped_app::{
    count_matching_logs, delete_skipped_app_by_id, get_skipped_apps,
    insert_skipped_app_and_delete_logs, restore_default_skipped_apps, update_skipped_app_by_id,
};
use std::sync::atomic::Ordering;
use std::sync::{atomic::AtomicBool, Mutex};

use app_prefs::{
    delete_app_metadata, get_app_metadata, get_calendar_view_prefs, set_app_metadata,
    set_calendar_view_prefs,
};
use db::get_db_schema_version;
use db::tables::google_calendar_sync::{
    create_google_calendar_event, delete_google_calendar_event, get_all_google_calendar_events,
    get_google_calendar_events, list_available_google_calendars, update_google_calendar_event,
};
use db::{
    create_manual_backup, create_safety_backup, get_backup_dir, get_database_location,
    get_db_path_cmd, list_backups, probe_database_location, reset_database_location,
    restore_backup, set_database_location,
};
use google_oauth::{
    get_google_auth_status, get_google_oauth_app_credentials, google_oauth_login,
    google_oauth_logout, set_google_oauth_app_credentials,
};
use sync::{
    check, device_logs, get_devices, register, reupload_all_logs, run_auto_sync_cycle,
    sync_countdown_reset_notify, sync_now, unsubscribe_device, upload_all_logs, SYNC_INTERVAL_SECS,
};
use tauri::{Emitter, Manager};
use tray::refresh_tray_menu;

pub struct UpdateState {
    pub update: Mutex<Option<tauri_plugin_updater::Update>>,
    pub window_visible: AtomicBool,
    pub notified: AtomicBool,
}

#[cfg(debug_assertions)]
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let entry_path = entry.path();
        let target_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry_path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&entry_path, &target_path)?;
        }
    }
    Ok(())
}

#[cfg(debug_assertions)]
fn webview_default_profile_dir(app_data_root: &std::path::Path) -> std::path::PathBuf {
    app_data_root.join("EBWebView").join("Default")
}

#[cfg(debug_assertions)]
fn local_storage_leveldb_has_data(default_dir: &std::path::Path) -> bool {
    let leveldb = default_dir.join("Local Storage").join("leveldb");
    if !leveldb.is_dir() {
        return false;
    }
    if leveldb.join("CURRENT").exists() {
        return true;
    }
    let Ok(read) = std::fs::read_dir(&leveldb) else {
        return false;
    };
    for entry in read.flatten() {
        if entry.path().extension().and_then(|e| e.to_str()) == Some("ldb") {
            return true;
        }
    }
    false
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    let version = app.package_info().version.to_string();
    #[cfg(debug_assertions)]
    {
        format!("{version}-dev")
    }
    #[cfg(not(debug_assertions))]
    {
        version
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    instance::init_env();

    #[cfg(debug_assertions)]
    {
        let _ = dotenv::dotenv();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(UpdateState {
                update: Mutex::new(None),
                window_visible: AtomicBool::new(false),
                notified: AtomicBool::new(false),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(instance::display_name());

                #[cfg(debug_assertions)]
                let _ = window.show();

                #[cfg(not(debug_assertions))]
                let _ = window.hide();
            }

            tray::setup_tray(app.handle())?;
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(1 * 60)).await;
                let reset_notify = sync_countdown_reset_notify();
                let sync_interval_secs = SYNC_INTERVAL_SECS;
                loop {
                    let registered =
                        matches!(sync::is_registered_for_sync().await, Ok(true));
                    if !registered {
                        tokio::time::sleep(std::time::Duration::from_secs(sync_interval_secs))
                            .await;
                        continue;
                    }

                    let _ = app_handle.emit("sync_started", ());
                    match run_auto_sync_cycle().await {
                        sync::AutoSyncResult::Skipped => {
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                            continue;
                        }
                        sync::AutoSyncResult::Completed { errors } => {
                            if errors.is_empty() {
                                let _ = app_handle.emit("sync-successful", ());
                                println!("sync successful");
                            } else {
                                let msg = errors.join("; ");
                                let _ = app_handle.emit("sync-error", &msg);
                                println!("sync failed: {}", msg);
                            }

                            'countdown: loop {
                                for remaining in (1..=sync_interval_secs).rev() {
                                    let _ =
                                        app_handle.emit("count_down_to_sync", remaining as i64);
                                    tokio::select! {
                                        _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {}
                                        _ = reset_notify.notified() => {
                                            continue 'countdown;
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            });

            tauri::async_runtime::spawn(supervisor(app.handle().clone()));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;

                let update = match handle.updater_builder().build() {
                    Ok(builder) => match builder.check().await {
                        Ok(update) => update,
                        Err(e) => {
                            if let Some(w) = handle.get_webview_window("main") {
                                let _ = w.emit("update-error", e.to_string());
                            }
                            None
                        }
                    },
                    Err(e) => {
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.emit("update-error", e.to_string());
                        }
                        None
                    }
                };

                let state = handle.state::<UpdateState>();
                if let Ok(mut lock) = state.update.lock() {
                    if update.is_some() {
                        *lock = update;
                    }
                }

                let has_update = handle
                    .state::<UpdateState>()
                    .update
                    .lock()
                    .ok()
                    .and_then(|g| g.as_ref().map(|_| ()))
                    .is_some();

                if !has_update {
                    return;
                }

                if state.notified.load(Ordering::Relaxed) {
                    return;
                }

                let _window_visible = state.window_visible.load(Ordering::Relaxed)
                    || handle
                        .get_webview_window("main")
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false);

                if state
                    .notified
                    .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
                    .is_ok()
                {
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.emit("update-available", ());
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|_window, event| {
            tray::handle_window_event(_window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            get_categories,
            get_week,
            get_week_for_app_filter,
            get_week_statistics,
            get_total_statistics,
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
            delete_logs_by_ids,
            delete_logs_for_time_block,
            count_logs_for_time_block,
            get_logs_for_time_block,
            get_logs_by_category,
            get_logs_for_app_in_time_range,
            get_skipped_apps,
            insert_skipped_app_and_delete_logs,
            update_skipped_app_by_id,
            delete_skipped_app_by_id,
            count_matching_logs,
            restore_default_skipped_apps,
            get_db_path_cmd,
            get_database_location,
            probe_database_location,
            set_database_location,
            reset_database_location,
            get_tracking_status,
            set_tracking_status,
            refresh_tray_menu,
            get_google_calendars,
            get_google_calendar_by_id,
            insert_google_calendar,
            update_google_calendar,
            delete_google_calendar,
            get_google_calendar_events,
            get_all_google_calendar_events,
            create_google_calendar_event,
            update_google_calendar_event,
            delete_google_calendar_event,
            list_available_google_calendars,
            google_oauth_login,
            google_oauth_logout,
            get_google_auth_status,
            get_google_oauth_app_credentials,
            set_google_oauth_app_credentials,
            get_calendar_view_prefs,
            set_calendar_view_prefs,
            get_app_metadata,
            set_app_metadata,
            delete_app_metadata,
            get_settings,
            flip_lock_by_key,
            reset_val_by_key,
            update_val_by_key,
            list_backups,
            create_manual_backup,
            restore_backup,
            get_backup_dir,
            create_safety_backup,
            get_db_schema_version,
            apply_update_cmd,
            check_update_cmd,
            get_app_version,
            instance::get_instance_info,
            set_is_tracking,
            unsubscribe_device,
            update_device,
            insert_devices,
            check,
            register,
            get_local_device_name,
            upload_all_logs,
            reupload_all_logs,
            sync::sync,
            sync_now,
            get_devices,
            device_logs,
            get_server_ip,
            set_server_ip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
