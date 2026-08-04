use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

static INSTANCE: OnceLock<InstanceConfig> = OnceLock::new();

const DATA_DIR_NAME: &str = "time-tracker";
const DISPLAY_NAME: &str = "Time Tracker";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstanceConfig {
    pub instance_id: String,
    pub display_name: String,
    pub data_dir_name: String,
}

impl InstanceConfig {
    fn default_config() -> Self {
        Self {
            instance_id: DATA_DIR_NAME.to_string(),
            display_name: DISPLAY_NAME.to_string(),
            data_dir_name: DATA_DIR_NAME.to_string(),
        }
    }
}

#[cfg(target_os = "windows")]
fn cleanup_stale_startup_entries() {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
        KEY_READ, KEY_SET_VALUE,
    };

    unsafe {
        let run_path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        let run_path_wide: Vec<u16> = run_path.encode_utf16().chain([0]).collect();

        let mut run_key = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(run_path_wide.as_ptr()),
            None,
            KEY_READ | KEY_SET_VALUE,
            &mut run_key,
        )
        .is_err()
        {
            return;
        }

        let mut to_delete: Vec<String> = Vec::new();
        let mut index = 0u32;

        loop {
            let mut name_buf = [0u16; 512];
            let mut name_len = name_buf.len() as u32;
            let mut value_type = 0u32;
            let mut data_len = 0u32;

            let result = RegEnumValueW(
                run_key,
                index,
                Some(windows::core::PWSTR(name_buf.as_mut_ptr())),
                &mut name_len,
                None,
                Some(&mut value_type),
                None,
                Some(&mut data_len),
            );

            if result.is_err() {
                break;
            }

            let name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
            if should_remove_run_key(&name) {
                to_delete.push(name);
            }
            index += 1;
        }

        for name in to_delete {
            let name_wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
            let _ = RegDeleteValueW(run_key, PCWSTR(name_wide.as_ptr()));
        }

        let _ = RegCloseKey(run_key);
    }
}

#[cfg(not(target_os = "windows"))]
fn cleanup_stale_startup_entries() {}

fn should_remove_run_key(name: &str) -> bool {
    if name == DATA_DIR_NAME {
        return false;
    }
    if name.starts_with('$') {
        return true;
    }
    if name.starts_with("beta") {
        return true;
    }
    name.starts_with("time-tracker-")
}

pub fn init_env() {
    cleanup_stale_startup_entries();

    #[cfg(target_os = "windows")]
    {
        let webview_dir = webview_data_dir();
        if std::fs::create_dir_all(&webview_dir).is_ok() {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir);
        }
    }
}

pub fn config() -> &'static InstanceConfig {
    INSTANCE.get_or_init(InstanceConfig::default_config)
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(DATA_DIR_NAME)
}

pub fn webview_data_dir() -> PathBuf {
    data_dir().join("webview")
}

pub fn display_name() -> &'static str {
    DISPLAY_NAME
}

#[tauri::command]
pub fn get_instance_info() -> InstanceConfig {
    config().clone()
}
