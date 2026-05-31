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

#[cfg(target_os = "linux")]
mod linux_fg {
    use std::collections::VecDeque;
    use std::time::Duration;

    use atspi::connection::set_session_accessibility;
    use atspi::proxy::accessible::{AccessibleProxy, ObjectRefExt};
    use atspi::zbus::Connection;
    use atspi::{AccessibilityConnection, ObjectRefOwned, Role, State};

    fn trim_output(stdout: &[u8]) -> String {
        String::from_utf8_lossy(stdout).trim().to_string()
    }

    fn run_ok(cmd: &str, args: &[&str]) -> Option<Vec<u8>> {
        let output = std::process::Command::new(cmd).args(args).output().ok()?;
        output.status.success().then_some(output.stdout)
    }

    fn run_ok_timeout(cmd: &str, args: &[&str], secs: u64) -> Option<Vec<u8>> {
        let dur = secs.to_string();
        let output = std::process::Command::new("timeout")
            .args(["-k", "1", dur.as_str(), cmd])
            .args(args)
            .output()
            .ok()?;
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

    fn from_swaymsg() -> Option<String> {
        let stdout = run_ok("swaymsg", &["-t", "get_tree"])?;
        let v: serde_json::Value = serde_json::from_slice(&stdout).ok()?;
        sway_focused_title(&v)
    }

    fn sway_focused_title(v: &serde_json::Value) -> Option<String> {
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
                    if let Some(t) = sway_focused_title(child) {
                        return Some(t);
                    }
                }
            }
        }
        None
    }

    fn from_kdotool() -> Option<String> {
        let s = trim_output(&run_ok("kdotool", &["getactivewindow", "getwindowname"])?);
        (!s.is_empty()).then_some(s)
    }

    fn is_gnome_like_session() -> bool {
        std::env::var("XDG_CURRENT_DESKTOP").ok().is_some_and(|s| {
            let l = s.to_lowercase();
            l.contains("gnome") || l.contains("ubuntu")
        })
    }

    fn from_gnome_focused_window_dbus() -> Option<String> {
        let out = run_ok(
            "gdbus",
            &[
                "call",
                "--session",
                "--dest",
                "org.gnome.Shell",
                "--object-path",
                "/org/gnome/shell/extensions/FocusedWindow",
                "--method",
                "org.gnome.shell.extensions.FocusedWindow.Get",
            ],
        )?;
        let text = String::from_utf8_lossy(&out);
        let start = text.find('{')?;
        let end = text.rfind('}')?;
        let v: serde_json::Value = serde_json::from_str(text.get(start..=end)?).ok()?;
        let title = v.get("title")?.as_str()?.trim();
        (!title.is_empty()).then_some(title.to_string())
    }

    async fn blocked_application(conn: &Connection, p: &AccessibleProxy<'_>) -> bool {
        let Ok(aref) = p.get_application().await else {
            return false;
        };
        if aref.is_null() {
            return false;
        };
        let Ok(app) = aref.into_accessible_proxy(conn).await else {
            return false;
        };
        let Ok(n) = app.name().await else {
            return false;
        };
        let n = n.to_lowercase();
        n.contains("gnome shell") || n == "gnome-shell" || n.contains("mutter")
    }

    async fn title_from_proxy(conn: &Connection, p: &AccessibleProxy<'_>) -> Option<String> {
        if blocked_application(conn, p).await {
            return None;
        }
        let role = p.get_role().await.ok()?;
        let state = p.get_state().await.ok()?;
        let active = state.contains(State::Active);
        let focused = state.contains(State::Focused);
        let match_role = match role {
            Role::Frame => active || focused,
            Role::Window | Role::DocumentFrame => focused,
            _ => false,
        };
        if !match_role {
            return None;
        }
        let mut cur = ObjectRefOwned::try_from(p).ok()?;
        for _ in 0..14 {
            let px = cur.as_accessible_proxy(conn).await.ok()?;
            if let Ok(name) = px.name().await {
                let t = name.trim();
                if !t.is_empty() {
                    return Some(t.to_string());
                }
            }
            let pref = px.parent().await.ok()?;
            if pref.is_null() {
                break;
            }
            cur = pref;
        }
        None
    }

    async fn shallow_has_focused(conn: &Connection, root: &ObjectRefOwned, max_depth: u32) -> bool {
        let mut stack = vec![(root.clone(), 0u32)];
        while let Some((obj, depth)) = stack.pop() {
            if obj.is_null() || depth > max_depth {
                continue;
            }
            let Ok(p) = obj.as_accessible_proxy(conn).await else {
                continue;
            };
            if !blocked_application(conn, &p).await {
                if let (Ok(role), Ok(st)) = (p.get_role().await, p.get_state().await) {
                    let fo = st.contains(State::Focused);
                    let ac = st.contains(State::Active);
                    if matches!(role, Role::Window | Role::Frame) && (fo || ac) {
                        return true;
                    }
                }
            }
            let Ok(n) = p.child_count().await else {
                continue;
            };
            for i in 0..n {
                if let Ok(c) = p.get_child_at_index(i).await {
                    stack.push((c, depth + 1));
                }
            }
        }
        false
    }

    async fn focused_app_index(conn: &Connection, apps: &[ObjectRefOwned]) -> Option<usize> {
        for (i, app) in apps.iter().enumerate() {
            if app.is_null() {
                continue;
            }
            let Ok(p) = app.as_accessible_proxy(conn).await else {
                continue;
            };
            if blocked_application(conn, &p).await {
                continue;
            }
            if shallow_has_focused(conn, app, 10).await {
                return Some(i);
            }
        }
        None
    }

    async fn search_subtree(
        conn: &Connection,
        root: ObjectRefOwned,
        max_nodes: u32,
    ) -> Option<String> {
        let mut q = VecDeque::from([root]);
        let mut seen = 0u32;
        while let Some(cur) = q.pop_front() {
            if seen >= max_nodes {
                break;
            }
            seen += 1;
            let Ok(p) = cur.as_accessible_proxy(conn).await else {
                continue;
            };
            if let Some(t) = title_from_proxy(conn, &p).await {
                return Some(t);
            }
            let Ok(n) = p.child_count().await else {
                continue;
            };
            for i in 0..n {
                if seen >= max_nodes {
                    break;
                }
                if let Ok(c) = p.get_child_at_index(i).await {
                    if !c.is_null() {
                        q.push_back(c);
                    }
                }
            }
        }
        None
    }

    async fn from_atspi_inner() -> Option<String> {
        let _ = set_session_accessibility(true).await;
        let aconn = AccessibilityConnection::new().await.ok()?;
        let zconn = aconn.connection();
        let root = aconn.root_accessible_on_registry().await.ok()?;
        let apps = root.get_children().await.ok()?;
        let mut order: Vec<usize> = (0..apps.len()).collect();
        if let Some(fi) = focused_app_index(zconn, &apps).await {
            if let Some(p) = order.iter().position(|&x| x == fi) {
                order.remove(p);
            }
            order.insert(0, fi);
        }
        for &idx in &order {
            let Some(app) = apps.get(idx) else {
                continue;
            };
            let app = app.clone();
            if app.is_null() {
                continue;
            }
            let Ok(ap) = app.as_accessible_proxy(zconn).await else {
                continue;
            };
            if blocked_application(zconn, &ap).await {
                continue;
            }
            if let Some(t) = search_subtree(zconn, app, 22000).await {
                return Some(t);
            }
        }
        None
    }

    fn from_atspi() -> Option<String> {
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => tokio::task::block_in_place(|| {
                handle.block_on(async {
                    tokio::time::timeout(Duration::from_secs(28), from_atspi_inner())
                        .await
                        .ok()
                        .flatten()
                })
            }),
            Err(_) => tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .ok()?
                .block_on(async {
                    tokio::time::timeout(Duration::from_secs(28), from_atspi_inner())
                        .await
                        .ok()
                        .flatten()
                }),
        }
    }

    fn from_xdotool() -> Option<String> {
        let s = trim_output(&run_ok_timeout(
            "xdotool",
            &["getactivewindow", "getwindowname"],
            2,
        )?);
        (!s.is_empty()).then_some(s)
    }

    pub fn active_window_title() -> Option<String> {
        let (a, b): (fn() -> Option<String>, fn() -> Option<String>) = if is_gnome_like_session() {
            (from_gnome_focused_window_dbus, from_hyprctl)
        } else {
            (from_hyprctl, from_gnome_focused_window_dbus)
        };
        a().or_else(b)
            .or_else(from_swaymsg)
            .or_else(from_kdotool)
            .or_else(from_xdotool)
            .or_else(from_atspi)
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

#[cfg(target_os = "linux")]
fn get_foreground_app() -> Result<String, Error> {
    linux_fg::active_window_title().ok_or_else(|| {
            anyhow::anyhow!(
                "Failed to get active window title (tried gdbus/GNOME, hyprctl, swaymsg, kdotool, xdotool, AT-SPI)"
            )
            .into()
        })
}

fn generate_log() -> Result<NewLog, Error> {
    let sanitized_app = sanitize_app_name(&get_foreground_app()?);
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    Ok(NewLog {
        app: sanitized_app,
        timestamp: now,
    })
}
pub async fn supervisor(app: AppHandle) {
    tokio::time::sleep(Duration::from_secs(10)).await;
    loop {
        if let Err(e) = background_process().await {
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

#[cfg(test)]
mod core_tests {
    use super::sanitize_app_name;

    #[test]
    fn test_sanitize_app_name() {
        let input = "  Visual\u{200B} Studio\u{FEFF} Code  ";
        let expected = "Visual Studio Code";

        assert_eq!(sanitize_app_name(input), expected);
    }
}
