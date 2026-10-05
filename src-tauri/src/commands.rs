use crate::logger::Log;
use crate::UpdateState;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

#[tauri::command]
pub async fn apply_update_cmd(app: AppHandle) -> Result<(), String> {
    Log::info("Update installation requested");
    let state = app.state::<UpdateState>();
    let update = Log::result("Lock pending update", state.update.lock())
        .map_err(|_| "update lock poisoned")?
        .take();
    let Some(update) = update else {
        Log::warn("Update installation skipped; no pending update");
        return Ok(());
    };
    Log::info(format!(
        "Update download started version={}",
        update.version
    ));

    if let Some(w) = app.get_webview_window("main") {
        let _ = crate::logger::Log::result("Native emit", w.emit("update-downloading", ()));
    }

    #[derive(Clone, serde::Serialize)]
    struct UpdateProgress {
        downloaded: u64,
        total: u64,
    }

    let app_progress = app.clone();
    let app_install = app.clone();
    let mut downloaded_bytes = 0u64;
    let mut last_logged_percent = None;
    update
        .download_and_install(
            move |downloaded, total| {
                downloaded_bytes += downloaded as u64;
                let percent = total.filter(|size| *size > 0).map(|size| downloaded_bytes * 100 / size);
                if percent.map(|value| value / 10) != last_logged_percent {
                    last_logged_percent = percent.map(|value| value / 10);
                    Log::info(format!("Update download progress bytes={downloaded_bytes} total={total:?} percent={percent:?}"));
                }
                if let Some(w) = app_progress.get_webview_window("main") {
                    let _ = crate::logger::Log::result("Native emit", w.emit(
                        "update-download-progress",
                        UpdateProgress {
                            downloaded: downloaded as u64,
                            total: total.unwrap_or(0),
                        },
                    ));
                }
            },
            move || {
                Log::info("Update download complete; installing");
                if let Some(w) = app_install.get_webview_window("main") {
                    let _ = crate::logger::Log::result("Native emit", w.emit("update-installing", ()));
                }
            },
        )
        .await
        .map_err(|e| {
            Log::error(format!("Update download/install failed: {e}"));
            e.to_string()
        })?;

    Log::info("Update installed successfully");

    if let Some(w) = app.get_webview_window("main") {
        let _ = crate::logger::Log::result("Native emit", w.emit("update-installed", ()));
    }

    #[cfg(target_os = "linux")]
    {
        let app_for_exit = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            app_for_exit.exit(0);
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn check_update_cmd(app: AppHandle) -> Result<bool, String> {
    Log::info("Manual update check started");
    use tauri_plugin_updater::UpdaterExt;

    let builder = Log::result(
        "Manual updater initialization",
        app.updater_builder().build(),
    )
    .map_err(|e| e.to_string())?;
    let update =
        Log::result("Manual update check", builder.check().await).map_err(|e| e.to_string())?;
    if let Some(update) = &update {
        Log::info(format!("Update available version={}", update.version));
    } else {
        Log::info("Manual update check completed; no update available");
    }

    let state = app.state::<UpdateState>();
    if let Ok(mut lock) = Log::result("Store available update", state.update.lock()) {
        *lock = update;
    }

    let has_update = Log::result("Read pending update", state.update.lock())
        .ok()
        .and_then(|g| g.as_ref().map(|_| ()))
        .is_some();

    if let Some(w) = app.get_webview_window("main") {
        if has_update {
            let _ = crate::logger::Log::result("Native emit", w.emit("update-available", ()));
        } else {
            let _ = crate::logger::Log::result("Native emit", w.emit("update-not-available", ()));
        }
    }

    Ok(has_update)
}
