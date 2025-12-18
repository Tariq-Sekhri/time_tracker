use crate::core::IS_SUSPENDED;
use std::sync::atomic::Ordering;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<String>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<String>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume", true, None::<String>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<String>)?;
    let menu = Menu::with_items(app, &[&show, &resume, &pause, &quit])?;

    let icon = app.default_window_icon()
        .ok_or_else(|| std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Failed to get default window icon"
        ))?
        .clone();
    
    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "pause" => {
                IS_SUSPENDED.store(true, Ordering::Relaxed);
            }
            "resume" => {
                IS_SUSPENDED.store(false, Ordering::Relaxed);
            }
            "show" => {
                if let Some(window) = app.get_window("main") {
                    if let Err(e) = window.show() {
                        eprintln!("Failed to show window: {}", e);
                    }
                    if let Err(e) = window.set_focus() {
                        eprintln!("Failed to set window focus: {}", e);
                    }
                }
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if let Err(e) = window.hide() {
            eprintln!("Failed to hide window: {}", e);
        }
        api.prevent_close();
    }
}
