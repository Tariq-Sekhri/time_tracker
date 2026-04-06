use crate::UpdateState;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

#[tauri::command]
pub async fn apply_update_cmd(app: AppHandle) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let update = state.update.lock().map_err(|_| "update lock poisoned")?.take();
    let Some(update) = update else {
        return Ok(());
    };

    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("update-downloading", ());
    }

    #[derive(Clone, serde::Serialize)]
    struct UpdateProgress {
        downloaded: u64,
        total: u64,
    }

    let app_progress = app.clone();
    let app_install = app.clone();
    update
        .download_and_install(
            move |downloaded, total| {
                if let Some(w) = app_progress.get_webview_window("main") {
                    let _ = w.emit(
                        "update-download-progress",
                        UpdateProgress {
                            downloaded: downloaded as u64,
                            total: total.unwrap_or(0),
                        },
                    );
                }
            },
            move || {
                if let Some(w) = app_install.get_webview_window("main") {
                    let _ = w.emit("update-installing", ());
                }
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("update-installed", ());
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
    use tauri_plugin_updater::UpdaterExt;

    let builder = app.updater_builder().build().map_err(|e| e.to_string())?;
    let update = builder.check().await.map_err(|e| e.to_string())?;

    let state = app.state::<UpdateState>();
    if let Ok(mut lock) = state.update.lock() {
        *lock = update;
    }

    let has_update = app
        .state::<UpdateState>()
        .update
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|_| ()))
        .is_some();

    if let Some(w) = app.get_webview_window("main") {
        if has_update {
            let _ = w.emit("update-available", ());
        } else {
            let _ = w.emit("update-not-available", ());
        }
    }

    Ok(has_update)
}

