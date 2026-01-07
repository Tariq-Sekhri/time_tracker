use crate::db;
use crate::db::tables::log::get_logs;
use crate::db::AppError as Error;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize, Clone)]
pub struct SkippedApp {
    pub id: i32,
    pub regex: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewSkippedApp {
    pub regex: String,
}

// Default skipped apps as regex patterns (exact match for legacy names)
const DEFAULT_SKIPPED_APPS: [&str; 7] = [
    "^$",                                    // Empty string
    "^Windows Default Lock Screen$",
    "^Task View$",
    "^Search$",
    "^Task Switching$",
    "^System tray overflow window\\.$",
    "^Program Manager$",
];

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Create table with regex column
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS skipped_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            regex TEXT NOT NULL UNIQUE
        );",
    )
    .execute(pool)
    .await?;

    // Migration: handle old app_name column
    // Get table info to check columns
    let table_info: Vec<(i32, String, String, i32, Option<String>, i32)> = sqlx::query_as("PRAGMA table_info(skipped_apps)")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    
    let column_names: Vec<String> = table_info.iter().map(|row| row.1.clone()).collect();
    let has_app_name = column_names.iter().any(|name| name == "app_name");
    let has_regex = column_names.iter().any(|name| name == "regex");
    
    if has_app_name {
        // Old schema exists - need to migrate
        if !has_regex {
            // Add regex column
            sqlx::query("ALTER TABLE skipped_apps ADD COLUMN regex TEXT")
                .execute(pool)
                .await
                .ok();
        }
        
        // Migrate data: copy app_name to regex with escaping
        let apps: Vec<(i32, String)> = sqlx::query_as("SELECT id, app_name FROM skipped_apps WHERE app_name IS NOT NULL")
            .fetch_all(pool)
            .await
            .unwrap_or_default();
        
        for (id, app_name) in apps {
            // Convert exact match to regex pattern
            let regex_pattern = if app_name.is_empty() {
                "^$".to_string()
            } else {
                format!("^{}$", regex::escape(&app_name))
            };
            sqlx::query("UPDATE skipped_apps SET regex = ? WHERE id = ?")
                .bind(&regex_pattern)
                .bind(id)
                .execute(pool)
                .await
                .ok();
        }
        
        // Create new table with correct schema
        sqlx::query("CREATE TABLE IF NOT EXISTS skipped_apps_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            regex TEXT NOT NULL UNIQUE
        )")
        .execute(pool)
        .await?;
        
        // Copy data to new table
        sqlx::query("INSERT OR IGNORE INTO skipped_apps_new (id, regex) SELECT id, regex FROM skipped_apps WHERE regex IS NOT NULL")
            .execute(pool)
            .await?;
        
        // Drop old table and rename new one
        sqlx::query("DROP TABLE skipped_apps")
            .execute(pool)
            .await?;
        
        sqlx::query("ALTER TABLE skipped_apps_new RENAME TO skipped_apps")
            .execute(pool)
            .await?;
    }

    // Insert default skipped apps if table is empty
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM skipped_apps")
        .fetch_one(pool)
        .await?;

    if count.0 == 0 {
        for regex_pattern in DEFAULT_SKIPPED_APPS.iter() {
            sqlx::query("INSERT OR IGNORE INTO skipped_apps (regex) VALUES (?)")
                .bind(regex_pattern)
                .execute(pool)
                .await?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_skipped_apps() -> Result<Vec<SkippedApp>, Error> {
    let pool = db::get_pool().await?;
    let apps = sqlx::query_as::<_, SkippedApp>("SELECT id, regex FROM skipped_apps ORDER BY regex")
        .fetch_all(pool)
        .await?;
    Ok(apps)
}

#[tauri::command]
pub async fn count_matching_logs(regex_pattern: String) -> Result<i64, Error> {
    // Validate regex first
    let compiled_regex = Regex::new(&regex_pattern)
        .map_err(|e| Error::Regex(e.to_string()))?;
    
    let logs = get_logs().await?;
    let count = logs.iter().filter(|log| compiled_regex.is_match(&log.app)).count();
    Ok(count as i64)
}

#[tauri::command]
pub async fn insert_skipped_app_and_delete_logs(new_app: NewSkippedApp) -> Result<i64, Error> {
    // Validate regex first
    let compiled_regex = Regex::new(&new_app.regex)
        .map_err(|e| Error::Regex(e.to_string()))?;
    
    let pool = db::get_pool().await?;
    
    // Optimized: Get all logs once, collect matching IDs, then delete in batch
    let logs = get_logs().await?;
    let matching_ids: Vec<i64> = logs
        .iter()
        .filter(|log| compiled_regex.is_match(&log.app))
        .map(|log| log.id)
        .collect();
    
    // Delete matching logs in batch using IN clause (much faster than one-by-one)
    if !matching_ids.is_empty() {
        // SQLite doesn't support variable-length IN clauses easily, so we'll use a transaction
        // and delete in chunks, or use a simpler approach: delete one by one but in a transaction
        // Actually, let's use a prepared statement with a loop for safety, but in a single transaction
        let mut tx = pool.begin().await?;
        for log_id in matching_ids {
            sqlx::query("DELETE FROM logs WHERE id = ?")
                .bind(log_id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
    }
    
    // Insert the skipped app - try INSERT first, if duplicate then get existing ID
    let id = match sqlx::query("INSERT INTO skipped_apps (regex) VALUES (?)")
        .bind(&new_app.regex)
        .execute(pool)
        .await
    {
        Ok(result) => {
            if result.rows_affected() > 0 {
                result.last_insert_rowid()
            } else {
                0
            }
        }
        Err(e) => {
            // If it's a unique constraint error, the pattern already exists - get its ID
            if e.to_string().contains("UNIQUE") {
                let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM skipped_apps WHERE regex = ?")
                    .bind(&new_app.regex)
                    .fetch_optional(pool)
                    .await?;
                existing.map(|(id,)| id).unwrap_or(0)
            } else {
                // Some other error - return it
                return Err(Error::Db(e.to_string()));
            }
        }
    };
    
    Ok(id)
}

#[tauri::command]
pub async fn insert_skipped_app(new_app: NewSkippedApp) -> Result<i64, Error> {
    // Validate regex first
    Regex::new(&new_app.regex)
        .map_err(|e| Error::Regex(e.to_string()))?;
    
    let pool = db::get_pool().await?;
    Ok(
        sqlx::query("INSERT INTO skipped_apps (regex) VALUES (?)")
            .bind(new_app.regex)
            .execute(pool)
            .await?
            .last_insert_rowid(),
    )
}

#[tauri::command]
pub async fn update_skipped_app_by_id(skipped_app: SkippedApp) -> Result<(), Error> {
    // Validate regex first
    Regex::new(&skipped_app.regex)
        .map_err(|e| Error::Regex(e.to_string()))?;
    
    let pool = db::get_pool().await?;
    sqlx::query("UPDATE skipped_apps SET regex = ? WHERE id = ?")
        .bind(&skipped_app.regex)
        .bind(skipped_app.id)
        .execute(pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_skipped_app_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("DELETE FROM skipped_apps WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn is_skipped_app(app_name: &str) -> Result<bool, Error> {
    let pool = db::get_pool().await?;
    let skipped_apps = sqlx::query_as::<_, SkippedApp>("SELECT id, regex FROM skipped_apps")
        .fetch_all(pool)
        .await?;
    
    for skipped in skipped_apps {
        if let Ok(regex) = Regex::new(&skipped.regex) {
            if regex.is_match(app_name) {
                return Ok(true);
            }
        }
    }
    
    Ok(false)
}

#[tauri::command]
pub async fn restore_default_skipped_apps() -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    // Insert all default skipped apps (INSERT OR IGNORE will skip duplicates)
    for regex_pattern in DEFAULT_SKIPPED_APPS.iter() {
        sqlx::query("INSERT OR IGNORE INTO skipped_apps (regex) VALUES (?)")
            .bind(regex_pattern)
            .execute(pool)
            .await?;
    }
    
    Ok(())
}
