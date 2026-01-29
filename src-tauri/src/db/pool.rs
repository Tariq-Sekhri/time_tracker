use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::env;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::db::backup;
use crate::db::validation;
use crate::db::tables::cat_regex;
use crate::db::tables::category;
use crate::db::tables::log;
use crate::db::tables::skipped_app;
use crate::db::tables::google_calendar;

static POOL: Mutex<Option<SqlitePool>> = Mutex::new(None);

pub fn drop_all() -> std::io::Result<()> {
    std::fs::remove_file(get_db_path())?;
    Ok(())
}

pub fn get_db_path() -> PathBuf {
    let appdata = env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    // Use app-test.db in dev mode (when running npm start / tauri dev)

    // #[cfg(debug_assertions)]
    // #[cfg(not(debug_assertions))]
    let db_filename = "app.db";
    // let db_filename = "app-test.db";


    PathBuf::from(appdata).join("time-tracker").join(db_filename)
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
    // Check if pool exists without holding lock across await
    let should_create = {
        let pool_guard = POOL.lock().unwrap();
        pool_guard.is_none()
    };

    if should_create {
        // Create new pool
        let pool = create_pool().await?;
        let pool_clone = pool.clone();
        let mut pool_guard = POOL.lock().unwrap();
        *pool_guard = Some(pool);
        Ok(pool_clone)
    } else {
        // Pool exists, return a clone
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
    let db_path = get_db_path();
    ensure_db_path(&db_path)?;

    // Step 1: Create daily backup BEFORE any database operations
    // This ensures we have a backup of the previous state
    if db_path.exists() && std::fs::metadata(&db_path).map(|m| m.len() > 0).unwrap_or(false) {
        let _ = backup::create_daily_backup();
    }

    // Step 2: Connect to database
    let connection_string = format!("sqlite://{}", db_path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(&connection_string)
        .await?;
    
    // Step 3: Create tables if they don't exist
    create_all_tables(&pool).await?;
    
    // Step 4: Validate and safely repair schema (uses ALTER TABLE, never drops data)
    let _ = validation::validate_and_repair_database(&pool).await;
    
    Ok(pool)
}

async fn create_all_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    log::create_table(pool).await?;
    category::create_table(pool).await?;
    cat_regex::create_table(pool).await?;
    skipped_app::create_table(pool).await?;
    google_calendar::create_table(pool).await?;
    Ok(())
}
