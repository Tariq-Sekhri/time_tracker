use crate::core::IS_SUSPENDED;
use crate::UpdateState;
use std::sync::atomic::Ordering;
use std::sync::OnceLock;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, Runtime, WindowEvent,
};

static TRAY_ICON: OnceLock<TrayIcon<tauri::Wry>> = OnceLock::new();
static APP_HANDLE: OnceLock<AppHandle<tauri::Wry>> = OnceLock::new();

fn create_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<String>)?;
    let is_paused = IS_SUSPENDED.load(Ordering::Relaxed);
    let toggle_text = if is_paused { "Resume" } else { "Pause" };
    let toggle = MenuItem::with_id(app, "toggle", toggle_text, true, None::<String>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<String>)?;
    Ok(Menu::with_items(app, &[&show, &toggle, &quit])?)
}

pub fn setup_tray(app: &AppHandle<tauri::Wry>) -> Result<(), Box<dyn std::error::Error>> {
    let _ = APP_HANDLE.set(app.clone());

    let menu = create_menu(app)?;
    let icon = app
        .default_window_icon()
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Failed to get default window icon",
            )
        })?
        .clone();

    let app_clone = app.clone();
    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "quit" => {
                crate::logger::Log::info("Quit requested from system tray");
                app.exit(0);
            }
            "toggle" => {
                let current_state = IS_SUSPENDED.load(Ordering::Relaxed);
                IS_SUSPENDED.store(!current_state, Ordering::Relaxed);

                refresh_tray_menu();

                let new_tracking_status = !IS_SUSPENDED.load(Ordering::Relaxed);
                crate::logger::Log::info(format!(
                    "Tracking toggled from system tray enabled={new_tracking_status}"
                ));
                if let Some(window) = app.get_webview_window("main") {
                    let _ = crate::logger::Log::result(
                        "Native emit",
                        window.emit("tracking-status-changed", new_tracking_status),
                    );
                }
            }
            "show" => {
                crate::logger::Log::info("Show window requested from system tray");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.unminimize();
                }

                let state = app.state::<UpdateState>();
                state.window_visible.store(true, Ordering::Relaxed);
                if state.notified.load(Ordering::Relaxed) {
                    return;
                }

                let has_update =
                    crate::logger::Log::result("Read pending tray update", state.update.lock())
                        .ok()
                        .and_then(|g| g.as_ref().map(|_| ()))
                        .is_some();

                if has_update
                    && state
                        .notified
                        .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
                        .is_ok()
                {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = crate::logger::Log::result(
                            "Native emit",
                            window.emit("update-available", ()),
                        );
                    }
                }
            }
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                if let Some(window) = app_clone.get_webview_window("main") {
                    crate::logger::Log::info("Window opened from system tray click");
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.unminimize();
                }

                let state = app_clone.state::<UpdateState>();
                state.window_visible.store(true, Ordering::Relaxed);
                if state.notified.load(Ordering::Relaxed) {
                    return;
                }

                let has_update =
                    crate::logger::Log::result("Read pending tray update", state.update.lock())
                        .ok()
                        .and_then(|g| g.as_ref().map(|_| ()))
                        .is_some();

                if has_update
                    && state
                        .notified
                        .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
                        .is_ok()
                {
                    if let Some(window) = app_clone.get_webview_window("main") {
                        let _ = crate::logger::Log::result(
                            "Native emit",
                            window.emit("update-available", ()),
                        );
                    }
                }
            }
        })
        .build(app)?;

    let _ = TRAY_ICON.set(tray);

    Ok(())
}
#[tauri::command]
pub fn refresh_tray_menu() {
    if let (Some(tray_icon), Some(app)) = (TRAY_ICON.get(), APP_HANDLE.get()) {
        let _ = crate::logger::Log::result(
            "Native set_menu",
            tray_icon.set_menu(None::<Menu<tauri::Wry>>),
        );
        if let Ok(new_menu) = crate::logger::Log::result("Create tray menu", create_menu(app)) {
            let _ =
                crate::logger::Log::result("Native set_menu", tray_icon.set_menu(Some(new_menu)));
        }
    }
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        crate::logger::Log::info("Window close requested; hiding to tray");
        let _ = window.hide();
        api.prevent_close();
        return;
    }
    match event {
        WindowEvent::Focused(focused) => {
            crate::logger::Log::debug(format!("Window focus changed focused={focused}"))
        }
        WindowEvent::Destroyed => crate::logger::Log::info("Window destroyed"),
        _ => {}
    }
}
