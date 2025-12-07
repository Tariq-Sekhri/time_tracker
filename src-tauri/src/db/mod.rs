#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]

use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::env;
use std::path::PathBuf;
use std::sync::OnceLock;
use thiserror::Error;

pub mod cat_regex;
pub mod category;
pub mod log;
#[derive(Debug, Serialize, Deserialize, Error)]
#[serde(tag = "type", content = "data")]
pub enum AppError {
    #[error("db error: {0}")]
    Db(String),
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => AppError::Db(other.to_string()),
        }
    }
}

static POOL: OnceLock<SqlitePool> = OnceLock::new();

pub fn drop_all() -> std::io::Result<()> {
    std::fs::remove_file(get_db_path())?;
    Ok(())
}

fn get_db_path() -> PathBuf {
    let appdata = env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata).join("time-tracker").join("app.db")
}

pub async fn get_pool() -> Result<&'static SqlitePool, sqlx::Error> {
    if let Some(pool) = POOL.get() {
        Ok(pool)
    } else {
        let pool = create_pool().await?;
        let _ = POOL.set(pool).ok();
        Ok(POOL.get().unwrap())
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

    let connection_string = format!("sqlite://{}", db_path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(&connection_string)
        .await?;
    create_all_tables(&pool).await?;
    Ok(pool)
}

async fn create_all_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    log::create_table(pool).await?;
    category::create_table(pool).await?;
    cat_regex::create_table(pool).await?;
    Ok(())
}
