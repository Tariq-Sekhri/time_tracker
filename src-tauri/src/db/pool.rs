use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::db::backup;
use crate::db::validation;

static POOL: Mutex<Option<SqlitePool>> = Mutex::new(None);

pub fn drop_all() -> std::io::Result<()> {
    std::fs::remove_file(get_db_path())?;
    Ok(())
}

pub fn get_db_path() -> PathBuf {
    let db_filename = "app.db";
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("time-tracker")
        .join(db_filename)
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
    let db_path = get_db_path();
    ensure_db_path(&db_path)?;

    if db_path.exists() && std::fs::metadata(&db_path).map(|m| m.len() > 0).unwrap_or(false) {
        backup::create_daily_backup().map_err(sqlx::Error::Io)?;
    }

    let connection_string = format!("sqlite://{}", db_path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(&connection_string)
        .await?;
    
    sqlx::migrate!("./migrations").run(&pool).await?;
    
    validation::validate_and_repair_database(&pool)
        .await
        .map_err(|e| sqlx::Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    
    Ok(pool)
}
