use std::fs;
use std::path::PathBuf;
use chrono::{Local, NaiveDate};
use crate::db::pool::get_db_path;

const MAX_DAILY_BACKUPS: usize = 7;  // Keep 7 days of daily backups
const MAX_SAFETY_BACKUPS: usize = 5; // Keep 5 pre-change safety backups

pub fn get_backup_dir() -> PathBuf {
    get_db_path().parent().unwrap().join("backups")
}

fn ensure_backup_dir() -> std::io::Result<PathBuf> {
    let backup_dir = get_backup_dir();
    if !backup_dir.exists() {
        fs::create_dir_all(&backup_dir)?;
    }
    Ok(backup_dir)
}

pub fn create_daily_backup() -> std::io::Result<Option<PathBuf>> {
    let db_path = get_db_path();
    if !db_path.exists() {
        return Ok(None);
    }

    let backup_dir = ensure_backup_dir()?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let backup_name = format!("daily_{}.db", today);
    let backup_path = backup_dir.join(&backup_name);

    if backup_path.exists() {
        return Ok(None);
    }

    fs::copy(&db_path, &backup_path)?;

    cleanup_old_backups(&backup_dir, "daily_", MAX_DAILY_BACKUPS)?;

    Ok(Some(backup_path))
}

pub fn create_safety_backup(reason: &str) -> std::io::Result<PathBuf> {
    let db_path = get_db_path();
    let backup_dir = ensure_backup_dir()?;
    
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let safe_reason = reason.replace(" ", "_").replace("/", "-");
    let backup_name = format!("safety_{}_{}.db", timestamp, safe_reason);
    let backup_path = backup_dir.join(&backup_name);

    fs::copy(&db_path, &backup_path)?;

    cleanup_old_backups(&backup_dir, "safety_", MAX_SAFETY_BACKUPS)?;

    Ok(backup_path)
}

fn cleanup_old_backups(backup_dir: &PathBuf, prefix: &str, keep_count: usize) -> std::io::Result<()> {
    let mut backups: Vec<_> = fs::read_dir(backup_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.file_name()
                .to_string_lossy()
                .starts_with(prefix)
        })
        .collect();

    if backups.len() <= keep_count {
        return Ok(());
    }

    backups.sort_by(|a, b| {
        let time_a = a.metadata().and_then(|m| m.modified()).ok();
        let time_b = b.metadata().and_then(|m| m.modified()).ok();
        time_a.cmp(&time_b)
    });

    let to_remove = backups.len() - keep_count;
    for entry in backups.into_iter().take(to_remove) {
        let path = entry.path();
        let _ = fs::remove_file(path);
    }

    Ok(())
}

pub fn list_backups() -> std::io::Result<Vec<BackupInfo>> {
    let backup_dir = get_backup_dir();
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups: Vec<BackupInfo> = fs::read_dir(&backup_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension()
                .map(|ext| ext == "db")
                .unwrap_or(false)
        })
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let backup_type = if name.starts_with("daily_") {
                BackupType::Daily
            } else if name.starts_with("safety_") {
                BackupType::Safety
            } else {
                BackupType::Manual
            };
            
            Some(BackupInfo {
                name,
                path: entry.path(),
                size: metadata.len(),
                modified: metadata.modified().ok()?,
                backup_type,
            })
        })
        .collect();

    backups.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(backups)
}

pub fn restore_backup(backup_name: &str) -> std::io::Result<()> {
    let backup_dir = get_backup_dir();
    let backup_path = backup_dir.join(backup_name);
    
    if !backup_path.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Backup not found: {}", backup_name)
        ));
    }

    let db_path = get_db_path();
    
    if db_path.exists() {
        create_safety_backup("pre_restore")?;
    }

    fs::copy(&backup_path, &db_path)?;

    Ok(())
}

pub fn verify_backup(backup_path: &PathBuf) -> std::io::Result<bool> {
    let header = fs::read(backup_path)?;
    if header.len() < 16 {
        return Ok(false);
    }
    
    let sqlite_header = b"SQLite format 3\0";
    Ok(&header[..16] == sqlite_header)
}

#[derive(Debug, Clone)]
pub struct BackupInfo {
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
    pub modified: std::time::SystemTime,
    pub backup_type: BackupType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BackupType {
    Daily,
    Safety,
    Manual,
}

pub fn create_manual_backup(name: &str) -> std::io::Result<PathBuf> {
    let db_path = get_db_path();
    let backup_dir = ensure_backup_dir()?;
    
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let safe_name = name.replace(" ", "_").replace("/", "-");
    let backup_name = format!("manual_{}_{}.db", timestamp, safe_name);
    let backup_path = backup_dir.join(&backup_name);

    fs::copy(&db_path, &backup_path)?;

    Ok(backup_path)
}

pub fn export_data_to_json() -> std::io::Result<PathBuf> {
    let backup_dir = ensure_backup_dir()?;
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let export_path = backup_dir.join(format!("export_{}.json", timestamp));
    
    Ok(export_path)
}
