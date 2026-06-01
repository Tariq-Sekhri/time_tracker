use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize)]
pub struct Setting {
    pub key: String,
    pub val: i32,
    pub is_locked: bool,
    pub default_val: i32,
    pub min_val: Option<i32>,
    pub max_val: Option<i32>,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            val INTEGER NOT NULL,
            is_locked INTEGER NOT NULL DEFAULT 0,
            default_val INTEGER NOT NULL,
            min_val INTEGER,
            max_val INTEGER
        );",
    )
    .execute(pool)
    .await?;

    seed_defaults(pool).await?;

    Ok(())
}

pub async fn seed_defaults(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let default_settings: &[(&str, i32, bool, i32, Option<i32>, Option<i32>)] = &[
        ("calendarStartHour", 5, false, 5, Some(0), Some(23)),
        ("calendarHeight", 100, false, 100, Some(50), Some(200)),
        ("rightSidebarWidth", 480, false, 480, Some(280), Some(800)),
        ("minLogDuration", 1, false, 1, Some(1), None),
        ("maxAttachDistance", 400, false, 400, Some(0), None),
        ("lookaheadWindow", 500, false, 500, Some(0), None),
        ("minDuration", 300, false, 300, Some(1), None),
        ("uiMinAppDuration", 30, false, 30, Some(1), None),
        ("categorySidebarCount", 5, false, 5, Some(1), Some(30)),
    ];

    for (key, val, is_locked, default_val, min_val, max_val) in default_settings {
        sqlx::query(
            "INSERT OR IGNORE INTO settings (key, val, is_locked, default_val, min_val, max_val)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(key)
        .bind(val)
        .bind(is_locked)
        .bind(default_val)
        .bind(min_val)
        .bind(max_val)
        .execute(pool)
        .await?;

        sqlx::query("UPDATE settings SET min_val = ?2, max_val = ?3 WHERE key = ?1")
            .bind(key)
            .bind(min_val)
            .bind(max_val)
            .execute(pool)
            .await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_settings() -> Result<Vec<Setting>, Error> {
    let pool = db::get_pool().await?;
    let settings = sqlx::query_as::<_, Setting>(
        "SELECT key, val, is_locked, default_val, min_val, max_val
         FROM settings
         ORDER BY key",
    )
    .fetch_all(&pool)
    .await?;

    Ok(settings)
}

#[tauri::command]
pub async fn flip_lock_by_key(key: String) -> Result<(), Error> {
    let pool = db::get_pool().await?;

    sqlx::query(
        "UPDATE settings SET is_locked = CASE WHEN is_locked = 1 THEN 0 ELSE 1 END WHERE key = ?1",
    )
    .bind(key)
    .execute(&pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn reset_val_by_key(key: String) -> Result<(), Error> {
    let pool = db::get_pool().await?;

    sqlx::query("UPDATE settings SET val = default_val WHERE key = ?1 AND is_locked = 0")
        .bind(key)
        .execute(&pool)
        .await?;

    Ok(())
}

#[tauri::command]
pub async fn update_val_by_key(key: String, new_val: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;

    let bounds = sqlx::query_as::<_, (Option<i32>, Option<i32>, bool)>(
        "SELECT min_val, max_val, is_locked FROM settings WHERE key = ?1",
    )
    .bind(&key)
    .fetch_optional(&pool)
    .await?;

    let (min_val, max_val, is_locked) = match bounds {
        Some(row) => row,
        None => return Ok(()),
    };

    if is_locked {
        return Ok(());
    }

    let mut val = new_val;
    if let Some(min) = min_val {
        val = val.max(min);
    }
    if let Some(max) = max_val {
        val = val.min(max);
    }

    sqlx::query("UPDATE settings SET val = ?2 WHERE key = ?1 AND is_locked = 0")
        .bind(&key)
        .bind(val)
        .execute(&pool)
        .await?;

    Ok(())
}
