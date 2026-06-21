use crate::db::Error;

#[cfg(target_os = "linux")]
fn get_foreground_app() -> Result<String, Error> {
    crate::core::linux_fg::active_window_title().ok_or_else(|| {
        anyhow::anyhow!(
                "Failed to get active window title (tried gdbus/GNOME, hyprctl, swaymsg, kdotool, xdotool, AT-SPI)"
            )
            .into()
    })
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
