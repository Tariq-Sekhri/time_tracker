use sqlx::migrate::MigrateError;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Mutex;
use std::time::Duration;

use crate::db::backup;
use crate::db::validation;
use crate::db::Error;
use serde::Serialize;

static POOL: Mutex<Option<SqlitePool>> = Mutex::new(None);

fn app_data_time_tracker_dir() -> PathBuf {
    crate::instance::data_dir()
}

fn database_location_config_path() -> PathBuf {
    app_data_time_tracker_dir().join("database_location.txt")
}

fn default_db_path() -> PathBuf {
    let db_filename = if cfg!(debug_assertions) {
        "apptest.db"
    } else {
        "app.db"
    };
    app_data_time_tracker_dir().join(db_filename)
}

fn db_file_has_data(path: &Path) -> bool {
    path.exists()
        && std::fs::metadata(path)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
}

fn migrate_dev_db_to_app_db_once() -> std::io::Result<()> {
    if cfg!(debug_assertions) || is_custom_db_path() {
        return Ok(());
    }

    let dir = app_data_time_tracker_dir();
    let marker = dir.join(".dev_db_promoted");
    if marker.exists() {
        return Ok(());
    }

    let app_db = dir.join("app.db");
    let dev_db = dir.join("dev.db");

    if !db_file_has_data(&dev_db) {
        std::fs::write(&marker, b"1")?;
        return Ok(());
    }

    let should_promote = if !db_file_has_data(&app_db) {
        true
    } else {
        let dev_modified = std::fs::metadata(&dev_db)?.modified()?;
        let app_modified = std::fs::metadata(&app_db)?.modified()?;
        dev_modified > app_modified
    };

    if should_promote {
        if db_file_has_data(&app_db) {
            let backup = dir.join(format!(
                "app.db.pre_dev_promote_{}",
                chrono::Local::now().format("%Y%m%d_%H%M%S")
            ));
            std::fs::copy(&app_db, &backup)?;
        }
        if let Some(parent) = app_db.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&dev_db, &app_db)?;
    }

    std::fs::write(&marker, b"1")?;
    Ok(())
}

fn read_custom_db_path() -> Option<PathBuf> {
    let config = database_location_config_path();
    let contents = std::fs::read_to_string(config).ok()?;
    let trimmed = contents.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(PathBuf::from(trimmed))
}

fn write_custom_db_path(path: &Path) -> std::io::Result<()> {
    let config = database_location_config_path();
    if let Some(parent) = config.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(config, path.to_string_lossy().as_bytes())
}

fn clear_custom_db_path() -> std::io::Result<()> {
    let config = database_location_config_path();
    if config.exists() {
        std::fs::remove_file(config)?;
    }
    Ok(())
}

fn paths_equal(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => {
            let a_s = a.to_string_lossy().replace('/', "\\").to_lowercase();
            let b_s = b.to_string_lossy().replace('/', "\\").to_lowercase();
            a_s == b_s
        }
    }
}

fn is_custom_db_path() -> bool {
    read_custom_db_path().is_some()
}

fn is_valid_sqlite_file(path: &Path) -> bool {
    backup::verify_backup(&path.to_path_buf()).unwrap_or(false)
}

fn seed_database_from_app_db_once(target_path: &PathBuf) -> std::io::Result<()> {
    if db_file_has_data(target_path) {
        return Ok(());
    }

    let prod = app_data_time_tracker_dir().join("app.db");
    if db_file_has_data(&prod) {
        if let Some(parent) = target_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&prod, target_path)?;
    }
    Ok(())
}

pub fn get_db_path() -> PathBuf {
    read_custom_db_path().unwrap_or_else(default_db_path)
}

#[derive(Serialize)]
pub struct DatabaseLocationInfo {
    pub path: String,
    pub default_path: String,
    pub is_custom: bool,
}

#[derive(Serialize)]
pub struct DatabaseLocationProbe {
    pub path: String,
    pub exists: bool,
    pub is_valid_sqlite: bool,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SetDatabaseLocationResult {
    Ok { path: String },
    NeedsOverwriteConfirmation { path: String },
}

#[tauri::command]
pub fn get_database_location() -> DatabaseLocationInfo {
    let path = get_db_path();
    let default_path = default_db_path();
    DatabaseLocationInfo {
        path: path.to_string_lossy().to_string(),
        default_path: default_path.to_string_lossy().to_string(),
        is_custom: is_custom_db_path(),
    }
}

#[tauri::command]
pub fn probe_database_location(path: String) -> Result<DatabaseLocationProbe, Error> {
    let path = resolve_location_path(&path)?;
    let exists = path.exists();
    let is_valid_sqlite = exists && path.is_file() && is_valid_sqlite_file(&path);
    Ok(DatabaseLocationProbe {
        path: path.to_string_lossy().to_string(),
        exists,
        is_valid_sqlite,
    })
}

#[tauri::command]
pub async fn set_database_location(
    path: String,
    overwrite: bool,
) -> Result<SetDatabaseLocationResult, Error> {
    let path = resolve_location_path(&path)?;
    let default_path = default_db_path();

    if paths_equal(&path, &default_path) {
        clear_custom_db_path()?;
        reopen_pool().await?;
        return Ok(SetDatabaseLocationResult::Ok {
            path: default_path.to_string_lossy().to_string(),
        });
    }

    if path.exists() {
        if path.is_dir() {
            return Err(Error(anyhow::anyhow!(
                "Database location must be a file path, not a directory"
            )));
        }

        if is_valid_sqlite_file(&path) {
            write_custom_db_path(&path)?;
            reopen_pool().await?;
            return Ok(SetDatabaseLocationResult::Ok {
                path: path.to_string_lossy().to_string(),
            });
        }

        if !overwrite {
            return Ok(SetDatabaseLocationResult::NeedsOverwriteConfirmation {
                path: path.to_string_lossy().to_string(),
            });
        }

        std::fs::remove_file(&path)?;
    }

    write_custom_db_path(&path)?;
    reopen_pool().await?;
    Ok(SetDatabaseLocationResult::Ok {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn reset_database_location() -> Result<DatabaseLocationInfo, Error> {
    clear_custom_db_path()?;
    reopen_pool().await?;
    Ok(get_database_location())
}

fn resolve_location_path(path: &str) -> Result<PathBuf, Error> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(Error(anyhow::anyhow!("Database location cannot be empty")));
    }
    Ok(PathBuf::from(trimmed))
}

async fn reopen_pool() -> Result<(), Error> {
    reset_pool().await?;
    get_pool().await?;
    Ok(())
}

pub async fn reset_pool() -> Result<(), sqlx::Error> {
    let pool_to_close = {
        let mut pool_guard = POOL.lock().unwrap();
        pool_guard.take()
    };
    if let Some(pool) = pool_to_close {
        pool.close().await;
    }
    Ok(())
}

pub async fn get_pool() -> Result<SqlitePool, sqlx::Error> {
    let should_create = {
        let pool_guard = POOL.lock().unwrap();
        pool_guard.is_none()
    };

    if should_create {
        let pool = create_pool().await?;
        let pool_clone = pool.clone();
        let mut pool_guard = POOL.lock().unwrap();
        *pool_guard = Some(pool);
        Ok(pool_clone)
    } else {
        let pool_guard = POOL.lock().unwrap();
        Ok(pool_guard.as_ref().unwrap().clone())
    }
}

fn ensure_db_path(db_path: &PathBuf) -> Result<(), sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| sqlx::Error::Io(e))?;
    }

    if !db_path.exists() {
        std::fs::File::create(&db_path).map_err(|e| sqlx::Error::Io(e))?;
    }
    Ok(())
}

async fn create_pool() -> Result<SqlitePool, sqlx::Error> {
    if !is_custom_db_path() {
        migrate_dev_db_to_app_db_once().map_err(sqlx::Error::Io)?;
        if cfg!(debug_assertions) {
            let db_path = get_db_path();
            seed_database_from_app_db_once(&db_path).map_err(sqlx::Error::Io)?;
        }
    }

    let db_path = get_db_path();
    ensure_db_path(&db_path)?;

    if db_file_has_data(&db_path) {
        backup::create_daily_backup().map_err(sqlx::Error::Io)?;
    }

    let connection_string = format!("sqlite://{}", db_path.display());
    let connect_options = SqliteConnectOptions::from_str(&connection_string)
        .map_err(|e| sqlx::Error::Configuration(e.into()))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(10));
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(connect_options)
        .await?;

    run_migrations(&pool).await?;

    run_schema_repair(&pool).await?;

    Ok(pool)
}

async fn run_schema_repair(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    validation::validate_and_repair_database(pool)
        .await
        .map(|_| ())
        .map_err(|e| {
            sqlx::Error::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ))
        })
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    match sqlx::migrate!("./migrations").run(pool).await {
        Ok(()) => Ok(()),
        Err(e) if migration_checksum_mismatch(&e) => Ok(()),
        Err(e) => Err(sqlx::Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))),
    }
}

fn migration_checksum_mismatch(err: &MigrateError) -> bool {
    let msg = err.to_string();
    msg.contains("was previously applied but has been modified")
        || msg.contains("checksum mismatch")
}
