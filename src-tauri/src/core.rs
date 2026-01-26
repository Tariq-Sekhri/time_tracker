use crate::db::tables::log::{self, increase_duration, NewLog};
use crate::db::tables::skipped_app;
use crate::db::Error;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[cfg(debug_assertions)]
pub static IS_SUSPENDED: AtomicBool = AtomicBool::new(true);

#[cfg(not(debug_assertions))]
pub static IS_SUSPENDED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn get_tracking_status() -> bool {
    !IS_SUSPENDED.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_tracking_status(is_tracking: bool) {
    IS_SUSPENDED.store(!is_tracking, Ordering::Relaxed);
}

/// Platform-specific implementation for getting the foreground/active application.
///
/// **WARNINGS & LIMITATIONS:**
///
/// 1. **Cross-compilation**: This approach uses Rust's conditional compilation (`#[cfg]`).
///    - You can only compile for the platform you're currently on (unless using cross-compilation tools)
///    - To build for macOS/Linux from Windows, you'll need to use cross-compilation or CI/CD
///
/// 2. **Linux Limitations**:
///    - **X11 only**: This implementation only works with X11, NOT Wayland
///    - Many modern Linux distributions use Wayland by default (GNOME, KDE Plasma 6+)
///    - Users on Wayland will get an error message
///    - **Solution**: Consider using `wlr-foreign-toplevel-management` or `xdg-desktop-portal` for Wayland support
///
/// 3. **macOS Limitations**:
///    - Requires proper entitlements in `Info.plist` for accessibility permissions
///    - Users may need to grant accessibility permissions in System Settings
///    - The app name returned is the localized name (may vary by language)
///
/// 4. **Windows**: Should work reliably, but window titles may not always match executable names
///
/// **Alternative Approaches:**
/// - Use a cross-platform crate like `active-win` (but it may have its own limitations)
/// - Use Tauri's built-in APIs if they add foreground app detection
/// - Implement a hybrid approach: X11 for Linux X11, Wayland protocol for Wayland
///
/// **Testing**: Make sure to test on each target platform before releasing!

/// Sanitizes app names by removing invisible Unicode characters that can break regex patterns.
/// Removes zero-width spaces, formatting characters, and other invisible characters.
fn sanitize_app_name(name: &str) -> String {
    name.chars()
        .filter(|c| {
            // Remove invisible/zero-width characters that break regex
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
                '\u{180E}'   // Mongolian Vowel Separator
            ) && !matches!(*c, '\u{FE00}'..='\u{FE0F}') // Variation Selectors
        })
        .collect::<String>()
        .trim() // Remove leading/trailing whitespace
        .to_string()
}

#[cfg(target_os = "windows")]
fn get_foreground_app() -> Result<String, Error> {
    use windows::Win32::UI::WindowsAndMessaging as ws;

    let hwnd = unsafe { ws::GetForegroundWindow() };
    let mut buf: [u16; 1024] = [0; 1024];
    let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
    let foreground_window = String::from_utf16_lossy(&buf[..n as usize]);
    Ok(foreground_window)
}

#[cfg(target_os = "macos")]
fn get_foreground_app() -> Result<String, Error> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let workspace_class = Class::get("NSWorkspace")
            .ok_or_else(|| Error::Other("Failed to get NSWorkspace class".to_string()))?;

        let workspace: *mut Object = msg_send![workspace_class, sharedWorkspace];
        if workspace.is_null() {
            return Err(Error::Other(
                "Failed to get shared workspace. Make sure the app has accessibility permissions."
                    .to_string(),
            ));
        }

        let front_app: *mut Object = msg_send![workspace, frontmostApplication];
        if front_app.is_null() {
            return Err(Error::Other(
                "Failed to get frontmost application. Check accessibility permissions.".to_string(),
            ));
        }

        let app_name: *mut Object = msg_send![front_app, localizedName];
        if app_name.is_null() {
            return Err(Error::Other("Failed to get application name".to_string()));
        }

        // app_name is an NSString, get UTF8String
        let c_string: *const i8 = msg_send![app_name, UTF8String];
        if c_string.is_null() {
            return Err(Error::Other(
                "Failed to get UTF8 string from application name".to_string(),
            ));
        }

        let app_name_str = std::ffi::CStr::from_ptr(c_string)
            .to_str()
            .map_err(|e| Error::Other(format!("Failed to convert string: {}", e)))?;

        Ok(app_name_str.to_string())
    }
}

#[cfg(target_os = "linux")]
fn get_foreground_app() -> Result<String, Error> {
    use std::ptr;
    use x11::xlib;

    unsafe {
        let display = xlib::XOpenDisplay(ptr::null());
        if display.is_null() {
            return Err(Error::Other("Failed to open X display. Make sure you're running in an X11 environment (not Wayland).".to_string()));
        }

        let mut focus_return: xlib::Window = 0;
        let mut revert_to: i32 = 0;

        xlib::XGetInputFocus(display, &mut focus_return, &mut revert_to);

        if focus_return == 0 {
            xlib::XCloseDisplay(display);
            return Err(Error::Other("Failed to get focused window".to_string()));
        }

        // Get window name using XFetchName (simpler than XGetWMName)
        let mut name: *mut i8 = ptr::null_mut();
        let result = xlib::XFetchName(display, focus_return, &mut name);

        if result == 0 || name.is_null() {
            // Try to get the window class name as fallback
            let mut class_hint: xlib::XClassHint = xlib::XClassHint {
                res_name: ptr::null_mut(),
                res_class: ptr::null_mut(),
            };

            if xlib::XGetClassHint(display, focus_return, &mut class_hint) != 0 {
                if !class_hint.res_class.is_null() {
                    let class_name = std::ffi::CStr::from_ptr(class_hint.res_class as *const i8)
                        .to_str()
                        .map_err(|e| Error::Other(format!("Failed to convert class name: {}", e)))?
                        .to_string();
                    xlib::XFree(class_hint.res_class as *mut std::ffi::c_void);
                    xlib::XCloseDisplay(display);
                    return Ok(class_name);
                }
            }

            xlib::XCloseDisplay(display);
            return Err(Error::Other(
                "Failed to get window name or class".to_string(),
            ));
        }

        let window_name = std::ffi::CStr::from_ptr(name)
            .to_str()
            .map_err(|e| Error::Other(format!("Failed to convert window name: {}", e)))?
            .to_string();

        xlib::XFree(name as *mut std::ffi::c_void);
        xlib::XCloseDisplay(display);

        Ok(window_name)
    }
}

fn generate_log() -> Result<NewLog, Error> {
    let foreground_window = get_foreground_app()?;
    let sanitized_app = sanitize_app_name(&foreground_window);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| Error::Other(e.to_string()))?
        .as_secs() as i64;
    Ok(NewLog {
        app: sanitized_app,
        timestamp: now,
    })
}
pub async fn supervisor(app: AppHandle) {
    tokio::time::sleep(Duration::from_secs(10)).await;
    loop {
        if let Err(e) = background_process().await {
            // Emit error to frontend
            let _ = app.emit("BackgroundProcessError", &e);
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
        let new_log = generate_log()?;

        if skipped_app::is_skipped_app(&new_log.app).await? {
            // Skip this app, it matches a skipped regex pattern
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
