//! Local support logging, using TikTok Archiver's chronological, single-line pattern.
//! Every level and both runtimes share the same file for the entire app launch.
use chrono::Local;
use regex::Regex;
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const KEEP_SESSIONS: usize = 10;
static LOGGER: OnceLock<Mutex<SupportLogger>> = OnceLock::new();
static LIBRARY_LOGGER: LibraryLogger = LibraryLogger;

struct LibraryLogger;
impl log::Log for LibraryLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::Level::Warn
    }
    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            Log::write(
                if record.level() == log::Level::Error {
                    LogLevel::Error
                } else {
                    LogLevel::Warn
                },
                record.target(),
                &record.args().to_string(),
            );
        }
    }
    fn flush(&self) {}
}

struct SupportLogger {
    path: PathBuf,
    file: File,
}

#[derive(Clone, Copy)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
}

impl LogLevel {
    fn label(self) -> &'static str {
        match self {
            Self::Error => "ERROR",
            Self::Warn => "WARN",
            Self::Info => "INFO",
            Self::Debug => "DEBUG",
        }
    }
}

pub struct Log;

impl Log {
    pub fn info(message: impl AsRef<str>) {
        Self::write(LogLevel::Info, "backend", message.as_ref());
    }
    pub fn error(message: impl AsRef<str>) {
        Self::write(LogLevel::Error, "backend", message.as_ref());
    }
    pub fn warn(message: impl AsRef<str>) {
        Self::write(LogLevel::Warn, "backend", message.as_ref());
    }
    pub fn debug(message: impl AsRef<str>) {
        Self::write(LogLevel::Debug, "backend", message.as_ref());
    }

    pub fn write(level: LogLevel, source: &str, message: &str) {
        let line = format_line(level, source, message);
        // File writes happen first; a detached/closed console must never stop logging.
        if let Some(logger) = LOGGER.get() {
            let mut logger = logger
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Err(error) = append(&mut logger.file, &line, matches!(level, LogLevel::Error)) {
                let _ = writeln!(
                    std::io::stderr(),
                    "Logging failure at {}: {error}",
                    logger.path.display()
                );
            }
        }
        let _ = writeln!(std::io::stderr(), "{line}");
    }

    /// Record failures even when callers intentionally recover or ignore the result.
    pub fn result<T, E: std::fmt::Display>(context: &str, result: Result<T, E>) -> Result<T, E> {
        if let Err(error) = &result {
            Self::error(format!("{context}: {error}"));
        }
        result
    }
}

fn append(file: &mut File, line: &str, durable: bool) -> std::io::Result<()> {
    writeln!(file, "{line}")?;
    file.flush()?;
    if durable {
        file.sync_data()?;
    }
    Ok(())
}

fn format_line(level: LogLevel, source: &str, message: &str) -> String {
    format!(
        "{} {} [{}] {}",
        Local::now().format("%Y-%m-%d %H:%M:%S%.3f %:z"),
        level.label(),
        compact(source),
        compact(&redact(message))
    )
}

fn compact(message: &str) -> String {
    // Preserve full error chains/stacks, while keeping one physical line per event.
    message.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn redact(message: &str) -> String {
    static PATTERNS: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| vec![
        (Regex::new(r#"(?i)\bBearer\s+[^\s\"',}]+"#).unwrap(), "Bearer [REDACTED]"),
        (Regex::new(r#"(?i)(https?://[^\s?\"<>]+)\?[^\s\"<>]*"#).unwrap(), "$1?[REDACTED]"),
        (Regex::new(r#"(?i)((?:access_token|refresh_token|client_secret|clientSecret|authorization|password|token|code)\s*[\"']?\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,}&]+)"#).unwrap(), "$1[REDACTED]"),
    ]);
    patterns
        .iter()
        .fold(message.to_string(), |text, (pattern, replacement)| {
            pattern.replace_all(&text, *replacement).into_owned()
        })
}

fn log_dir() -> PathBuf {
    crate::instance::data_dir().join("logs")
}

fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic| {
        let thread = std::thread::current();
        Log::error(format!(
            "Rust panic thread={} {panic}; backtrace={}",
            thread.name().unwrap_or("unnamed"),
            std::backtrace::Backtrace::force_capture()
        ));
    }));
}

pub fn init() {
    let directory = log_dir();
    let result = (|| -> std::io::Result<SupportLogger> {
        fs::create_dir_all(&directory)?;
        let path = directory.join(format!(
            "time-tracker-{}-{}.log",
            Local::now().format("%Y-%m-%d_%H-%M-%S%.3f"),
            std::process::id()
        ));
        let file = OpenOptions::new()
            .create_new(true)
            .append(true)
            .open(&path)?;
        Ok(SupportLogger { path, file })
    })();
    match result {
        Ok(logger) => {
            let _ = LOGGER.set(Mutex::new(logger));
        }
        Err(error) => {
            let _ = writeln!(
                std::io::stderr(),
                "Cannot create support log in {}: {error}",
                directory.display()
            );
        }
    }
    if let Err(error) = log::set_logger(&LIBRARY_LOGGER) {
        Log::error(format!("Library logger registration failed: {error}"));
    }
    log::set_max_level(log::LevelFilter::Warn);
    install_panic_hook();
    Log::info(format!(
        "App launch version={} build={} os={} arch={} pid={} log={}",
        env!("CARGO_PKG_VERSION"),
        if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        std::env::consts::OS,
        std::env::consts::ARCH,
        std::process::id(),
        current_path().display()
    ));
    if let Err(error) = retain_sessions(&directory) {
        Log::error(format!("Log retention failed: {error}"));
    }
}

fn retain_sessions(directory: &Path) -> std::io::Result<()> {
    let mut files = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("time-tracker-")
            && name.ends_with(".log")
            && entry.file_type()?.is_file()
        {
            files.push(entry.path());
        }
    }
    files.sort();
    let remove_count = files.len().saturating_sub(KEEP_SESSIONS);
    for path in files.into_iter().take(remove_count) {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn current_path() -> PathBuf {
    LOGGER
        .get()
        .map(|logger| {
            logger
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .path
                .clone()
        })
        .unwrap_or_default()
}

#[derive(Serialize)]
pub struct SupportLogInfo {
    pub path: String,
    pub directory: String,
    pub available: bool,
}

#[tauri::command]
pub fn get_support_log_info() -> SupportLogInfo {
    SupportLogInfo {
        path: current_path().to_string_lossy().into_owned(),
        directory: log_dir().to_string_lossy().into_owned(),
        available: LOGGER.get().is_some(),
    }
}

#[tauri::command]
pub fn log_frontend(level: String, message: String) {
    let level = match level.as_str() {
        "error" => LogLevel::Error,
        "warn" => LogLevel::Warn,
        "debug" => LogLevel::Debug,
        _ => LogLevel::Info,
    };
    Log::write(level, "frontend", &message);
}

#[tauri::command]
pub fn open_support_log_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    Log::info("Opening support log folder");
    Log::result(
        "Open support log folder",
        app.opener()
            .open_path(log_dir().to_string_lossy(), None::<&str>),
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn errors_keep_details_but_secrets_are_redacted() {
        let line = format_line(LogLevel::Error, "frontend", "failed\nstack line\tBearer private-token https://example.test/oauth?code=private-code&state=private-state {\"client_secret\":\"private-secret\",\"refresh_token\":\"private-refresh\"}");
        assert!(!line.contains('\n'));
        assert!(line.contains("stack line"));
        for secret in [
            "private-token",
            "private-code",
            "private-state",
            "private-secret",
            "private-refresh",
        ] {
            assert!(!line.contains(secret), "{line}");
        }
    }
    #[test]
    fn all_levels_append_to_one_file_and_retention_keeps_ten_sessions() {
        let directory =
            std::env::temp_dir().join(format!("time-tracker-logger-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        for index in 0..12 {
            fs::write(
                directory.join(format!("time-tracker-{index:02}.log")),
                "launch\n",
            )
            .unwrap();
        }
        fs::write(directory.join("unrelated.txt"), "keep").unwrap();
        retain_sessions(&directory).unwrap();
        assert!(!directory.join("time-tracker-00.log").exists());
        assert!(directory.join("unrelated.txt").exists());
        let path = directory.join("time-tracker-11.log");
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        for level in [
            LogLevel::Info,
            LogLevel::Debug,
            LogLevel::Warn,
            LogLevel::Error,
        ] {
            append(&mut file, &format_line(level, "backend", "event"), true).unwrap();
        }
        drop(file);
        let contents = fs::read_to_string(path).unwrap();
        for level in ["INFO", "DEBUG", "WARN", "ERROR"] {
            assert!(contents.contains(level));
        }
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn backend_frontend_and_thread_panics_share_one_durable_file() {
        let directory = std::env::temp_dir().join(format!(
            "time-tracker-shared-log-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("session.log");
        let file = OpenOptions::new()
            .create_new(true)
            .append(true)
            .open(&path)
            .unwrap();
        assert!(LOGGER
            .set(Mutex::new(SupportLogger {
                path: path.clone(),
                file
            }))
            .is_ok());
        Log::info("backend operation");
        log_frontend("error".into(), "frontend caught error".into());
        let previous_hook = std::panic::take_hook();
        install_panic_hook();
        let thread = std::thread::Builder::new()
            .name("diagnostic-test".into())
            .spawn(|| {
                panic!("simulated background panic");
            })
            .unwrap();
        assert!(thread.join().is_err());
        std::panic::set_hook(previous_hook);
        let contents = fs::read_to_string(&path).unwrap();
        assert!(contents.contains("[backend] backend operation"));
        assert!(contents.contains("[frontend] frontend caught error"));
        assert!(contents.contains("Rust panic thread=diagnostic-test"));
        assert!(contents.contains("simulated background panic"));
        assert!(contents.contains("backtrace="));
        assert_eq!(
            contents
                .lines()
                .filter(|line| line.contains("Rust panic thread=diagnostic-test"))
                .count(),
            1
        );
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        assert!(directory
            .canonicalize()
            .unwrap()
            .starts_with(std::env::temp_dir().canonicalize().unwrap()));
        fs::remove_dir_all(directory).unwrap();
    }
}
