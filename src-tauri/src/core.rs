    use crate::db::tables::log::{self, increase_duration, NewLog};
    use crate::db::tables::skipped_app;
    use crate::db::Error;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tauri::{AppHandle, Emitter};
    #[cfg(target_os = "macos")]
    use anyhow::Context;

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
    /// 2. **Linux**:
    ///    - Tries Hyprland (`hyprctl`), Sway (`swaymsg`), KDE (`kdotool`), AT-SPI, then `xdotool`
    ///    - AT-SPI needs a session D-Bus and accessibility enabled where applicable
    ///
    /// 3. **macOS Limitations**:
    ///    - Requires proper entitlements in `Info.plist` for accessibility permissions
    ///    - Users may need to grant accessibility permissions in System Settings
    ///    - The app name returned is the localized name (may vary by language)
    ///
    /// 4. **Windows**: Should work reliably, but window titles may not always match executable names

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
            .trim() 
            .to_string()
    }

    #[cfg(target_os = "linux")]
    mod linux_fg {
        use atspi::connection::set_session_accessibility;
        use atspi::proxy::accessible::ObjectRefExt;
        use atspi::zbus::Connection;
        use atspi::{AccessibilityConnection, ObjectRefOwned, Role, State};

        fn trim_output(stdout: &[u8]) -> String {
            String::from_utf8_lossy(stdout).trim().to_string()
        }

        fn run_ok(cmd: &str, args: &[&str]) -> Option<Vec<u8>> {
            let output = std::process::Command::new(cmd).args(args).output().ok()?;
            output.status.success().then_some(output.stdout)
        }

        fn from_hyprctl() -> Option<String> {
            let stdout = run_ok("hyprctl", &["-j", "activewindow"])?;
            let v: serde_json::Value = serde_json::from_slice(&stdout).ok()?;
            let title = v.get("title")?.as_str()?.trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
            v.get("class")?
                .as_str()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        }

        fn find_sway_focused_title(v: &serde_json::Value) -> Option<String> {
            if v.get("focused").and_then(|x| x.as_bool()) == Some(true) {
                if let Some(name) = v.get("name").and_then(|n| n.as_str()) {
                    let name = name.trim();
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
            }
            for key in ["nodes", "floating_nodes"] {
                if let Some(arr) = v.get(key).and_then(|n| n.as_array()) {
                    for child in arr {
                        if let Some(t) = find_sway_focused_title(child) {
                            return Some(t);
                        }
                    }
                }
            }
            None
        }

        fn from_swaymsg() -> Option<String> {
            let stdout = run_ok("swaymsg", &["-t", "get_tree"])?;
            let v: serde_json::Value = serde_json::from_slice(&stdout).ok()?;
            find_sway_focused_title(&v)
        }

        fn from_kdotool() -> Option<String> {
            let stdout = run_ok("kdotool", &["getactivewindow", "getwindowname"])?;
            let s = trim_output(&stdout);
            (!s.is_empty()).then_some(s)
        }

        async fn deep_search_active_frame(
            conn: &Connection,
            root_ref: ObjectRefOwned,
        ) -> Option<String> {
            let mut stack = vec![root_ref];
            while let Some(current) = stack.pop() {
                if current.is_null() {
                    continue;
                }
                let proxy = current.into_accessible_proxy(conn).await.ok()?;
                let role = proxy.get_role().await.ok()?;
                let state = proxy.get_state().await.ok()?;
                if role == Role::Frame && state.contains(State::Active) {
                    if let Ok(name) = proxy.name().await {
                        let n = name.trim();
                        if !n.is_empty() {
                            return Some(n.to_string());
                        }
                    }
                }
                let count = proxy.child_count().await.ok()?;
                for j in (0..count).rev() {
                    let Ok(child_ref) = proxy.get_child_at_index(j).await else {
                        continue;
                    };
                    if !child_ref.is_null() {
                        stack.push(child_ref);
                    }
                }
            }
            None
        }

        async fn from_atspi_inner() -> Option<String> {
            let _ = set_session_accessibility(true).await;
            let conn = AccessibilityConnection::new().await.ok()?;
            let zconn = conn.connection();
            let root = conn.root_accessible_on_registry().await.ok()?;
            let apps = root.get_children().await.ok()?;

            for app_ref in apps.iter().cloned() {
                if app_ref.is_null() {
                    continue;
                }
                let app = app_ref.into_accessible_proxy(zconn).await.ok()?;
                let n = app.child_count().await.ok()?;
                for j in 0..n {
                    let child_ref = app.get_child_at_index(j).await.ok()?;
                    if child_ref.is_null() {
                        continue;
                    }
                    let child = child_ref.into_accessible_proxy(zconn).await.ok()?;
                    let role = child.get_role().await.ok()?;
                    let state = child.get_state().await.ok()?;
                    if role == Role::Frame && state.contains(State::Active) {
                        if let Ok(name) = child.name().await {
                            let t = name.trim();
                            if !t.is_empty() {
                                return Some(t.to_string());
                            }
                        }
                    }
                }
            }

            for app_ref in apps {
                if app_ref.is_null() {
                    continue;
                }
                if let Some(t) = deep_search_active_frame(zconn, app_ref).await {
                    return Some(t);
                }
            }

            None
        }

        fn from_atspi() -> Option<String> {
            match tokio::runtime::Handle::try_current() {
                Ok(handle) => tokio::task::block_in_place(|| handle.block_on(from_atspi_inner())),
                Err(_) => tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .ok()?
                    .block_on(from_atspi_inner()),
            }
        }

        fn from_xdotool() -> Option<String> {
            let stdout = run_ok("xdotool", &["getactivewindow", "getwindowname"])?;
            let s = trim_output(&stdout);
            (!s.is_empty()).then_some(s)
        }

        pub fn active_window_title() -> Option<String> {
            from_hyprctl()
                .or_else(from_swaymsg)
                .or_else(from_kdotool)
                .or_else(from_atspi)
                .or_else(from_xdotool)
        }
    }

    #[cfg(target_os = "windows")]
    fn get_foreground_app() -> Result<String, Error> {
        use windows::Win32::UI::WindowsAndMessaging as ws;

        let hwnd = unsafe { ws::GetForegroundWindow() };
        let mut buf: [u16; 1024] = [0; 1024];
        let n = unsafe { ws::GetWindowTextW(hwnd, &mut buf) };
        Ok(String::from_utf16_lossy(&buf[..n as usize]))
    }

    #[cfg(target_os = "macos")]
    fn get_foreground_app() -> Result<String, Error> {
        use objc::runtime::{Class, Object};
        use objc::{msg_send, sel, sel_impl};

        unsafe {
            let workspace_class = Class::get("NSWorkspace")
                .ok_or_else(|| anyhow::anyhow!("Failed to get NSWorkspace class"))?;

            let workspace: *mut Object = msg_send![workspace_class, sharedWorkspace];
            if workspace.is_null() {
                return Err(anyhow::anyhow!("Failed to get shared workspace. Make sure the app has accessibility permissions.").into());
            }

            let front_app: *mut Object = msg_send![workspace, frontmostApplication];
            if front_app.is_null() {
                return Err(anyhow::anyhow!("Failed to get frontmost application. Check accessibility permissions.").into());
            }

            let app_name: *mut Object = msg_send![front_app, localizedName];
            if app_name.is_null() {
                return Err(anyhow::anyhow!("Failed to get application name").into());
            }

            // app_name is an NSString, get UTF8String
            let c_string: *const i8 = msg_send![app_name, UTF8String];
            if c_string.is_null() {
                return Err(anyhow::anyhow!("Failed to get UTF8 string from application name").into());
            }

            let app_name_str = std::ffi::CStr::from_ptr(c_string)
                .to_str()
                .context("Failed to convert string")?;

            Ok(app_name_str.to_string())
        }
    }

    #[cfg(target_os = "linux")]
    fn get_foreground_app() -> Result<String, Error> {
        linux_fg::active_window_title().ok_or_else(|| {
            anyhow::anyhow!(
                "Failed to get active window title (tried hyprctl, swaymsg, kdotool, AT-SPI, xdotool)"
            )
            .into()
        })
    }

    #[cfg(test)]
    mod foreground_app_tests {
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        use super::get_foreground_app;

        #[test]
        #[cfg(all(test, target_os = "windows"))]
        fn get_foreground_app_returns_non_empty_on_windows() {
            match get_foreground_app() {
                Ok(s) => assert!(
                    !s.trim().is_empty(),
                    "expected non-empty foreground name; got Ok(len={}, repr={:?})",
                    s.len(),
                    s
                ),
                Err(e) => panic!(
                    "expected Ok(non-empty) from get_foreground_app(); got Err({:?})",
                    e
                ),
            }
        }

        #[test]
        #[cfg(all(test, target_os = "macos"))]
        fn get_foreground_app_returns_non_empty_on_macos() {
            match get_foreground_app() {
                Ok(s) => assert!(
                    !s.trim().is_empty(),
                    "expected non-empty foreground name; got Ok(len={}, repr={:?})",
                    s.len(),
                    s
                ),
                Err(e) => panic!(
                    "expected Ok(non-empty) from get_foreground_app(); got Err({:?})",
                    e
                ),
            }
        }

    }

    fn generate_log() -> Result<NewLog, Error> {
        let foreground_window = get_foreground_app()?;
        let sanitized_app = sanitize_app_name(&foreground_window);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
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