#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use crate::db::tables::log::{self, increase_duration, NewLog, PENDING_LOCAL_DEVICE_UUID};
use crate::db::tables::skipped_app;
use crate::db::Error;

#[cfg(target_os = "linux")]
use crate::core::linux::get_foreground_app;
#[cfg(target_os = "macos")]
use crate::core::macos::get_foreground_app;
#[cfg(target_os = "windows")]
use crate::core::windows::get_foreground_app;
use crate::db::tables::device::get_local_device_uuid;
use crate::logger::Log;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[cfg(debug_assertions)]
pub static IS_SUSPENDED: AtomicBool = AtomicBool::new(false);

#[cfg(not(debug_assertions))]
pub static IS_SUSPENDED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn get_tracking_status() -> bool {
    !IS_SUSPENDED.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_tracking_status(is_tracking: bool) {
    Log::info(format!("Tracking status requested enabled={is_tracking}"));
    #[cfg(debug_assertions)]
    {
        let _ = is_tracking;
    }
    #[cfg(not(debug_assertions))]
    IS_SUSPENDED.store(!is_tracking, Ordering::Relaxed);
}
fn sanitize_app_name(name: &str) -> String {
    name.chars()
        .filter(|c| {
            !matches!(
                *c,
                // Zero-width and invisible formatting characters
                '\u{FEFF}' | // Zero Width No-Break Space (BOM)
                    '\u{200B}' | // Zero Width Space
                    '\u{200C}' | // Zero Width Non-Joiner
                    '\u{200D}' | // Zero Width Joiner
                    '\u{200E}' | // Left-to-Right Mark
                    '\u{200F}' | // Right-to-Left Mark
                    '\u{2005}' | // Four-Per-Em Space
                    '\u{2000}' | // En Quad
                    '\u{2001}' | // Em Quad
                    '\u{2002}' | // En Space
                    '\u{2003}' | // Em Space
                    '\u{2004}' | // Three-Per-Em Space
                    '\u{2006}' | // Six-Per-Em Space
                    '\u{2007}' | // Figure Space
                    '\u{2008}' | // Punctuation Space
                    '\u{2009}' | // Thin Space
                    '\u{200A}' | // Hair Space
                    '\u{2028}' | // Line Separator
                    '\u{2029}' | // Paragraph Separator
                    '\u{202A}' | // Left-to-Right Embedding
                    '\u{202B}' | // Right-to-Left Embedding
                    '\u{202C}' | // Pop Directional Formatting
                    '\u{202D}' | // Left-to-Right Override
                    '\u{202E}' | // Right-to-Left Override
                    '\u{2060}' | // Word Joiner
                    '\u{2061}' | // Function Application
                    '\u{2062}' | // Invisible Times
                    '\u{2063}' | // Invisible Separator
                    '\u{2064}' | // Invisible Plus
                    '\u{180E}' // Mongolian Vowel Separator
            ) && !matches!(*c, '\u{FE00}'..='\u{FE0F}') // Variation Selectors
        })
        .collect::<String>()
        .trim()
        .to_string()
}

async fn generate_log() -> Result<NewLog, Error> {
    let sanitized_app = sanitize_app_name(&get_foreground_app()?);
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    let device_uuid = Some(log_device_uuid(get_local_device_uuid().await?));
    Ok(NewLog {
        app: sanitized_app,
        device_uuid,
        timestamp: now,
    })
}

fn log_device_uuid(local_device_uuid: Option<String>) -> String {
    local_device_uuid.unwrap_or_else(|| PENDING_LOCAL_DEVICE_UUID.to_string())
}

pub async fn supervisor(app: AppHandle) {
    Log::info(format!(
        "Tracking supervisor started on {}",
        std::env::consts::OS
    ));
    tokio::time::sleep(Duration::from_secs(10)).await;
    let mut last_error: Option<(String, Instant)> = None;
    loop {
        if let Err(e) = background_process().await {
            let message = e.to_string();
            // Persist every failure; only the GUI notification is throttled.
            Log::error(format!("Tracking failed: {message}"));
            let should_report = last_error
                .as_ref()
                .map(|(previous, reported_at)| {
                    previous != &message || reported_at.elapsed() >= Duration::from_secs(30)
                })
                .unwrap_or(true);

            if !should_report {
                continue;
            }

            let user_message = format!(
                "{message}\n\nDiagnostic log: {}",
                crate::logger::current_path().display()
            );
            let _ = crate::logger::Log::result(
                "Native emit",
                app.emit("tracking-error", &user_message),
            );
            let _ =
                crate::logger::Log::result("Native emit", app.emit("BackgroundProcessError", &e));
            last_error = Some((message, Instant::now()));
        }
    }
}

async fn background_process() -> Result<(), Error> {
    let mut last_log_id: i64 = -1;
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;

        if IS_SUSPENDED.load(Ordering::Relaxed) {
            continue;
        }
        let new_log = generate_log().await?;

        if skipped_app::is_skipped_app(&new_log.app).await? {
            // Skip this app, it matches a skipped regex pattern
            continue;
        }

        if last_log_id == -1 {
            let is_pending_device =
                new_log.device_uuid.as_deref() == Some(PENDING_LOCAL_DEVICE_UUID);
            last_log_id = log::insert_log(new_log).await?;
            Log::debug(format!(
                "Tracking segment created id={last_log_id}{}",
                if is_pending_device {
                    " using pending local device identity"
                } else {
                    ""
                }
            ));
        } else {
            let last_log = log::get_log_by_id(last_log_id).await?;
            if last_log.app == new_log.app {
                increase_duration(last_log.id).await?;
            } else {
                last_log_id = log::insert_log(new_log).await?;
                Log::debug(format!("Tracking segment created id={last_log_id}"));
            }
        }
    }
}

#[cfg(test)]
mod core_tests {
    use super::{log_device_uuid, sanitize_app_name};
    use crate::db::tables::log::PENDING_LOCAL_DEVICE_UUID;

    #[test]
    fn test_sanitize_app_name() {
        let input = "  Visual\u{200B} Studio\u{FEFF} Code  ";
        let expected = "Visual Studio Code";

        assert_eq!(sanitize_app_name(input), expected);
    }

    #[test]
    fn uses_pending_identity_before_sync_registration() {
        assert_eq!(log_device_uuid(None), PENDING_LOCAL_DEVICE_UUID);
        assert_eq!(
            log_device_uuid(Some("device-uuid".to_string())),
            "device-uuid"
        );
    }
}
