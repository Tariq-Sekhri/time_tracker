use crate::core::IS_SUSPENDED;
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
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "quit" => {
                    app.exit(0);
                }
                "toggle" => {
                    let current_state = IS_SUSPENDED.load(Ordering::Relaxed);
                    IS_SUSPENDED.store(!current_state, Ordering::Relaxed);

                    refresh_tray_menu();

                    let new_tracking_status = !IS_SUSPENDED.load(Ordering::Relaxed);
                    if let Some(window) = app.get_window("main") {
                        let _ = window.emit("tracking-status-changed", new_tracking_status);
                    }
                }
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.unminimize();
                    }
                }
                _ => {}
            }
        })
        .on_tray_icon_event(move |_tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                if let Some(window) = app_clone.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.unminimize();
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
        let _ = tray_icon.set_menu(None::<Menu<tauri::Wry>>);
        if let Ok(new_menu) = create_menu(app) {
            let _ = tray_icon.set_menu(Some(new_menu));
        }
    }
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
    }
}
