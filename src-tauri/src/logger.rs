//! Local support logging, using TikTok Archiver's chronological, single-line pattern.
//! Every level and both runtimes share the same file for the entire app launch.
use chrono::{DateTime, FixedOffset, Local};
use regex::Regex;
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
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

    /// Crash-time write: never blocks on the logger lock and skips regex redaction,
    /// so it stays usable from an exception filter with little stack left.
    pub fn write_emergency(message: &str) {
        let line = format!(
            "{} ERROR [crash] {}",
            Local::now().format("%Y-%m-%d %H:%M:%S%.3f %:z"),
            message
        );
        if let Some(Ok(mut logger)) = LOGGER.get().map(|logger| logger.try_lock()) {
            let _ = append(&mut logger.file, &line, true);
        }
        let _ = writeln!(std::io::stderr(), "{line}");
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
    let previous = previous_session(&directory);
    init_in(&directory);
    if let Some(previous) = previous {
        report_previous_session(&previous, crate::diagnostics::boot_time());
        if previous.outcome(crate::diagnostics::boot_time()).is_unclean() {
            crate::diagnostics::report_os_crash_records(previous.last_time);
        }
    }
    crate::diagnostics::install();
}

/// How the newest earlier session log ends, read before this launch creates its own file.
struct PreviousSession {
    file: String,
    last_line: String,
    last_time: Option<DateTime<FixedOffset>>,
}

#[derive(Debug, PartialEq)]
enum PreviousOutcome {
    Clean,
    Update,
    Panic,
    NativeCrash,
    SystemRestart,
    Unexpected,
}

impl PreviousOutcome {
    fn is_unclean(&self) -> bool {
        matches!(self, Self::Panic | Self::NativeCrash | Self::Unexpected)
    }
}

impl PreviousSession {
    fn outcome(&self, boot_time: Option<DateTime<Local>>) -> PreviousOutcome {
        let line = &self.last_line;
        if line.contains("Application exited normally") {
            PreviousOutcome::Clean
        } else if line.contains("Rust panic") {
            PreviousOutcome::Panic
        } else if line.contains("[crash]") {
            PreviousOutcome::NativeCrash
        } else if line.contains("Update download complete; installing") {
            PreviousOutcome::Update
        } else if matches!((self.last_time, boot_time), (Some(last), Some(boot)) if last < boot) {
            PreviousOutcome::SystemRestart
        } else {
            PreviousOutcome::Unexpected
        }
    }
}

fn previous_session(directory: &Path) -> Option<PreviousSession> {
    let path = session_files(directory).ok()?.pop()?;
    let last_line = last_line(&path).ok()?;
    let last_time = last_line
        .get(..30)
        .and_then(|stamp| DateTime::parse_from_str(stamp, "%Y-%m-%d %H:%M:%S%.3f %:z").ok());
    Some(PreviousSession {
        file: path.file_name()?.to_string_lossy().into_owned(),
        last_line,
        last_time,
    })
}

fn last_line(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let length = file.metadata()?.len();
    file.seek(SeekFrom::Start(length.saturating_sub(64 * 1024)))?;
    let mut tail = Vec::new();
    file.read_to_end(&mut tail)?;
    Ok(String::from_utf8_lossy(&tail)
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or_default()
        .to_string())
}

fn report_previous_session(previous: &PreviousSession, boot_time: Option<DateTime<Local>>) {
    let last: String = previous.last_line.chars().take(600).collect();
    let file = &previous.file;
    match previous.outcome(boot_time) {
        PreviousOutcome::Clean => Log::info(format!("Previous session exited cleanly file={file}")),
        PreviousOutcome::Update => Log::info(format!("Previous session closed to install an update file={file}")),
        PreviousOutcome::SystemRestart => Log::warn(format!(
            "Previous session ended by Windows shutdown, restart, or power loss boot_time={} file={file} last_line={last}",
            boot_time.map(|t| t.to_rfc3339()).unwrap_or_default()
        )),
        PreviousOutcome::Panic => Log::error(format!("Previous session crashed with a Rust panic file={file} last_line={last}")),
        PreviousOutcome::NativeCrash => Log::error(format!("Previous session crashed natively file={file} last_line={last}")),
        PreviousOutcome::Unexpected => Log::error(format!(
            "Previous session ended unexpectedly with no exit or crash record (killed, logged off, or an unhandled abort) file={file} last_line={last}"
        )),
    }
}

fn init_in(directory: &Path) {
    // data_dir() separates development and production sessions. Both retain files.
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

fn session_files(directory: &Path) -> std::io::Result<Vec<PathBuf>> {
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
    Ok(files)
}

fn retain_sessions(directory: &Path) -> std::io::Result<()> {
    let files = session_files(directory)?;
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
    fn previous_session_outcome_comes_from_its_last_line() {
        let directory =
            std::env::temp_dir().join(format!("time-tracker-previous-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        assert!(previous_session(&directory).is_none());
        let boot = DateTime::parse_from_rfc3339("2026-10-21T05:00:00-04:00")
            .unwrap()
            .with_timezone(&Local);
        let cases = [
            ("2026-10-21 06:00:00.000 -04:00 INFO [backend] Application exited normally", PreviousOutcome::Clean),
            ("2026-10-21 06:00:00.000 -04:00 ERROR [backend] Rust panic thread=main panicked", PreviousOutcome::Panic),
            ("2026-10-21 06:00:00.000 -04:00 ERROR [crash] Native crash code=0xC00000FD", PreviousOutcome::NativeCrash),
            ("2026-10-21 06:00:00.000 -04:00 INFO [backend] Update download complete; installing", PreviousOutcome::Update),
            ("2026-10-21 04:35:00.000 -04:00 INFO [backend] Heartbeat", PreviousOutcome::SystemRestart),
            ("2026-10-21 06:00:00.000 -04:00 INFO [backend] Heartbeat", PreviousOutcome::Unexpected),
        ];
        for (index, (line, expected)) in cases.into_iter().enumerate() {
            let path = directory.join(format!("time-tracker-{index:02}.log"));
            fs::write(&path, format!("2026-10-21 04:00:00.000 -04:00 INFO [backend] App launch
{line}

")).unwrap();
            let previous = previous_session(&directory).unwrap();
            assert_eq!(previous.last_line, line);
            assert_eq!(previous.outcome(Some(boot)), expected, "{line}");
        }
        fs::remove_dir_all(directory).unwrap();
    }
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
        // Exercise the real initializer, including the development build path.
        init_in(&directory);
        let path = current_path();
        assert!(path.starts_with(&directory));
        assert!(path.is_file());
        assert!(get_support_log_info().available);
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
