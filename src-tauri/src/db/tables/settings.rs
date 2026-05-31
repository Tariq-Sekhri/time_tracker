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
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            val INTEGER NOT NULL,
            is_locked INTEGER NOT NULL DEFAULT 0,
            default_val INTEGER NOT NULL
        );",
    )
    .execute(pool)
    .await?;

    let row = sqlx::query!("SELECT COUNT(*) as count FROM settings")
        .fetch_one(pool)
        .await?;

    if row.count == 0 {
        let default_settings: &[(&str, i32, bool, i32)] = &[
            ("calendarStartHour", 8, true, 5),
            ("calendarHeight", 100, false, 100),
            ("rightSidebarWidth", 480, false, 480),
            ("minLogDuration", 1, false, 1),
            ("maxAttachDistance", 400, false, 400),
            ("lookaheadWindow", 500, false, 500),
            ("minDuration", 300, false, 300),
            ("uiMinAppDuration", 30, false, 30),
            ("categorySidebarCount", 5, false, 5),
        ];

        for (key, val, is_locked, default_val) in default_settings {
            sqlx::query!(
                "INSERT OR IGNORE INTO settings (key, val, is_locked, default_val) VALUES (?1, ?2, ?3, ?4)",
                key,
                val,
                is_locked,
                default_val
            )
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_settings() -> Result<Vec<Setting>, Error> {
    let pool = db::get_pool().await?;
    let settings = sqlx::query_as!(
        Setting,
        r#"
        SELECT
            key as "key!: String",
            val as "val!: i32",
            is_locked as "is_locked!: bool",
            default_val as "default_val!: i32"
        FROM settings
        ORDER BY key
        "#
    )
    .fetch_all(&pool)
    .await?;

    Ok(settings)
}

#[tauri::command]
pub async fn flip_lock_by_key(key: String) -> Result<(), Error> {
    let pool = db::get_pool().await?;

    sqlx::query!(
        "UPDATE settings SET is_locked = CASE WHEN is_locked = 1 THEN 0 ELSE 1 END WHERE key = ?1",
        key
    )
    .execute(&pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn reset_val_by_key(key: String) -> Result<(), Error> {
    let pool = db::get_pool().await?;

    sqlx::query!(
        "UPDATE settings SET val = default_val WHERE key = ?1 AND is_locked = 0",
        key
    )
    .execute(&pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn update_val_by_key(key: String, new_val: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;

    sqlx::query!(
        "UPDATE settings SET val = ?2 WHERE key = ?1 AND is_locked = 0",
        key,
        new_val
    )
    .execute(&pool)
    .await?;

    Ok(())
}
