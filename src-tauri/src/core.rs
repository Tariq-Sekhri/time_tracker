use crate::db::tables::log::{self, increase_duration, NewLog};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, SystemTimeError, UNIX_EPOCH};

use windows::Win32::UI::WindowsAndMessaging as ws;

pub static IS_SUSPENDED: AtomicBool = AtomicBool::new(false);

fn generate_log() -> Result<NewLog, SystemTimeError> {
    let hwnd = unsafe { ws::GetForegroundWindow() };

    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let fore_ground_window = String::from_utf16_lossy(&buf[..n as usize]);
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    Ok(NewLog {
        app: fore_ground_window,
        timestamp: now,
    })
}
// todo if process creases the frontend should know
pub async fn background_process() {
    let mut last_log_id: i64 = -1;

    loop {
        if !IS_SUSPENDED.load(Ordering::Relaxed) {
            let new_log = generate_log().unwrap();
            if log::SKIPPED_APPS
                .into_iter()
                .find(|app| app == &new_log.app)
                != None
            {
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
            if last_log_id == -1 {
                last_log_id = log::insert_log(new_log).await.unwrap()
            } else {
                match log::get_log_by_id(last_log_id).await {
                    Ok(last_log) => {
                        if last_log.app == new_log.app {
                            increase_duration(last_log.id).await.unwrap();
                        } else {
                            last_log_id = log::insert_log(new_log).await.unwrap();
                        }
                    }
                    Err(e) => {
                        eprintln!("Error getting log {e}");
                        return;
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
