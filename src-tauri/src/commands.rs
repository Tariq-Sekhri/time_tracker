use crate::UpdateState;
use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub async fn apply_update_cmd(app: AppHandle) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let update = state.update.lock().map_err(|_| "update lock poisoned")?.take();
    let Some(update) = update else {
        return Ok(());
    };

    update
        .download_and_install(|_downloaded, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

