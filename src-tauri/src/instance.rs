use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

static INSTANCE: OnceLock<InstanceConfig> = OnceLock::new();

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstanceConfig {
    pub instance_id: String,
    pub display_name: String,
    pub data_dir_name: String,
}

impl InstanceConfig {
    fn default_config() -> Self {
        Self {
            instance_id: "time-tracker".to_string(),
            display_name: "Time Tracker".to_string(),
            data_dir_name: "time-tracker".to_string(),
        }
    }
}

fn install_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()?
        .parent()
        .map(|p| p.to_path_buf())
}

fn load_from_install_dir() -> Option<InstanceConfig> {
    let dir = install_dir()?;
    let contents = std::fs::read_to_string(dir.join("instance.json")).ok()?;
    serde_json::from_str(&contents).ok()
}

pub fn init_env() {
    #[cfg(target_os = "windows")]
    {
        let webview_dir = webview_data_dir();
        if std::fs::create_dir_all(&webview_dir).is_ok() {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir);
        }
    }
}

pub fn config() -> &'static InstanceConfig {
    INSTANCE.get_or_init(|| load_from_install_dir().unwrap_or_else(InstanceConfig::default_config))
}

pub fn data_dir() -> PathBuf {
    if let Some(dir) = install_dir() {
        if let Ok(contents) = std::fs::read_to_string(dir.join("data_dir.txt")) {
            let trimmed = contents.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed);
            }
        }
    }

    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(&config().data_dir_name)
}

pub fn webview_data_dir() -> PathBuf {
    data_dir().join("webview")
}

pub fn display_name() -> &'static str {
    &config().display_name
}

#[tauri::command]
pub fn get_instance_info() -> InstanceConfig {
    config().clone()
}
