use crate::db::tables::log::{self, increase_duration, NewLog};
use crate::db::tables::skipped_app;
use crate::db::AppError;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, SystemTimeError, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use windows::Win32::UI::WindowsAndMessaging as ws;

pub static IS_SUSPENDED: AtomicBool = AtomicBool::new(false);

fn generate_log() -> Result<NewLog, SystemTimeError> {
    let hwnd = unsafe { ws::GetForegroundWindow() };

    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let foreground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    Ok(NewLog {
        app: foreground_window,
        timestamp: now,
    })
}
pub async fn supervisor(app: AppHandle) {
    tokio::time::sleep(Duration::from_secs(10)).await;
    loop {
        if let Err(e) = background_process().await {
            // Emit error to frontend, log if emission fails
            if let Err(emit_err) = app.emit("BackgroundProcessError", &e) {
                eprintln!("Failed to emit error event: {}", emit_err);
            }
            eprintln!("Background process error: {}", e);
            // TODO: Add proper logger
        }
    }
}

async fn background_process() -> Result<(), AppError> {
    let mut last_log_id: i64 = -1;
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;

        if IS_SUSPENDED.load(Ordering::Relaxed) {
            continue;
        }
        let new_log = generate_log()?;

        if skipped_app::is_skipped_app(&new_log.app).await? {
            // Delete the skipped app from the database so it will be tracked again
            let _ = skipped_app::delete_skipped_app_by_name(&new_log.app).await;
            continue;
        }

        if last_log_id == -1 {
            last_log_id = log::insert_log(new_log).await?;
        } else {
            let last_log = log::get_log_by_id(last_log_id).await?;
            if last_log.app == new_log.app {
                increase_duration(last_log.id).await?;
            } else {
                last_log_id = log::insert_log(new_log).await?;
            }
        }
    }
}
