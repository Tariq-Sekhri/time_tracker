use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

const RUNNING_TIMER_KEY: &str = "running_manual_time_timer_v1";

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ManualTimeBlock {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewManualTimeBlock {
    pub title: String,
    pub notes: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateManualTimeBlock {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningManualTimer {
    pub title: String,
    pub notes: Option<String>,
    pub start_time: i64,
    #[serde(default)]
    pub end_time: Option<i64>,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS manual_time_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_manual_time_blocks_range
         ON manual_time_blocks(start_time, end_time)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

fn validate(
    title: &str,
    notes: Option<&str>,
    start_time: i64,
    end_time: i64,
) -> Result<(String, Option<String>), Error> {
    let title = title.trim();
    if title.is_empty() {
        return Err(anyhow::anyhow!("A title is required").into());
    }
    if title.chars().count() > 200 {
        return Err(anyhow::anyhow!("Title must be 200 characters or fewer").into());
    }
    if end_time <= start_time {
        return Err(anyhow::anyhow!("End time must be after start time").into());
    }

    let notes = notes
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    Ok((title.to_string(), notes))
}

#[tauri::command]
pub async fn get_manual_time_blocks(
    range_start: i64,
    range_end: i64,
) -> Result<Vec<ManualTimeBlock>, Error> {
    if range_end <= range_start {
        return Err(anyhow::anyhow!("Range end must be after range start").into());
    }
    let pool = db::get_pool().await?;
    Ok(sqlx::query_as::<_, ManualTimeBlock>(
        "SELECT id, title, notes, start_time, end_time, created_at, updated_at
         FROM manual_time_blocks
         WHERE end_time > ?1 AND start_time < ?2
         ORDER BY start_time, id",
    )
    .bind(range_start)
    .bind(range_end)
    .fetch_all(&pool)
    .await?)
}

#[tauri::command]
pub async fn insert_manual_time_block(
    new_manual_time_block: NewManualTimeBlock,
) -> Result<i64, Error> {
    let (title, notes) = validate(
        &new_manual_time_block.title,
        new_manual_time_block.notes.as_deref(),
        new_manual_time_block.start_time,
        new_manual_time_block.end_time,
    )?;
    let pool = db::get_pool().await?;
    let now = chrono::Utc::now().timestamp();
    let result = sqlx::query(
        "INSERT INTO manual_time_blocks
         (title, notes, start_time, end_time, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
    )
    .bind(title)
    .bind(notes)
    .bind(new_manual_time_block.start_time)
    .bind(new_manual_time_block.end_time)
    .bind(now)
    .execute(&pool)
    .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn get_running_manual_timer() -> Result<Option<RunningManualTimer>, Error> {
    let pool = db::get_pool().await?;
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .fetch_optional(&pool)
        .await?;

    value
        .map(|value| serde_json::from_str(&value).map_err(|error| anyhow::Error::new(error).into()))
        .transpose()
}

#[tauri::command]
pub async fn start_manual_timer() -> Result<RunningManualTimer, Error> {
    let timer = RunningManualTimer {
        title: String::new(),
        notes: None,
        start_time: chrono::Utc::now().timestamp(),
        end_time: None,
    };
    let pool = db::get_pool().await?;
    let existing = sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .fetch_optional(&pool)
        .await?;
    if existing.is_some() {
        return Err(anyhow::anyhow!("A manual timer is already running").into());
    }
    let value = serde_json::to_string(&timer).map_err(anyhow::Error::new)?;
    sqlx::query("INSERT INTO app_metadata (key, value) VALUES (?1, ?2)")
        .bind(RUNNING_TIMER_KEY)
        .bind(value)
        .execute(&pool)
        .await?;
    Ok(timer)
}

#[tauri::command]
pub async fn update_manual_timer_title(title: String) -> Result<RunningManualTimer, Error> {
    let title = title.trim();
    if title.is_empty() {
        return Err(anyhow::anyhow!("A title is required").into());
    }
    if title.chars().count() > 200 {
        return Err(anyhow::anyhow!("Title must be 200 characters or fewer").into());
    }

    let pool = db::get_pool().await?;
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("No manual timer is running"))?;
    let mut timer: RunningManualTimer = serde_json::from_str(&value).map_err(anyhow::Error::new)?;
    timer.title = title.to_string();
    let value = serde_json::to_string(&timer).map_err(anyhow::Error::new)?;
    sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?2")
        .bind(value)
        .bind(RUNNING_TIMER_KEY)
        .execute(&pool)
        .await?;
    Ok(timer)
}

#[tauri::command]
pub async fn stop_manual_timer() -> Result<RunningManualTimer, Error> {
    let pool = db::get_pool().await?;
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("No manual timer is running"))?;
    let mut timer: RunningManualTimer = serde_json::from_str(&value).map_err(anyhow::Error::new)?;
    if timer.end_time.is_none() {
        timer.end_time = Some(chrono::Utc::now().timestamp().max(timer.start_time + 1));
        let value = serde_json::to_string(&timer).map_err(anyhow::Error::new)?;
        sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?2")
            .bind(value)
            .bind(RUNNING_TIMER_KEY)
            .execute(&pool)
            .await?;
    }
    Ok(timer)
}

#[tauri::command]
pub async fn finish_manual_timer() -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let mut transaction = pool.begin().await?;
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| anyhow::anyhow!("No manual timer is running"))?;
    let timer: RunningManualTimer = serde_json::from_str(&value).map_err(anyhow::Error::new)?;
    if timer.title.trim().is_empty() {
        return Err(anyhow::anyhow!("Add a name before recording this timer").into());
    }
    let end_time = timer
        .end_time
        .ok_or_else(|| anyhow::anyhow!("Stop the timer before recording it"))?;
    let now = chrono::Utc::now().timestamp();
    let result = sqlx::query(
        "INSERT INTO manual_time_blocks
         (title, notes, start_time, end_time, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
    )
    .bind(timer.title)
    .bind(timer.notes)
    .bind(timer.start_time)
    .bind(end_time)
    .bind(now)
    .execute(&mut *transaction)
    .await?;
    sqlx::query("DELETE FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_manual_time_block(
    manual_time_block: UpdateManualTimeBlock,
) -> Result<(), Error> {
    let (title, notes) = validate(
        &manual_time_block.title,
        manual_time_block.notes.as_deref(),
        manual_time_block.start_time,
        manual_time_block.end_time,
    )?;
    let pool = db::get_pool().await?;
    let result = sqlx::query(
        "UPDATE manual_time_blocks
         SET title = ?1, notes = ?2, start_time = ?3, end_time = ?4, updated_at = ?5
         WHERE id = ?6",
    )
    .bind(title)
    .bind(notes)
    .bind(manual_time_block.start_time)
    .bind(manual_time_block.end_time)
    .bind(chrono::Utc::now().timestamp())
    .bind(manual_time_block.id)
    .execute(&pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(
            anyhow::anyhow!("Manual time block {} does not exist", manual_time_block.id).into(),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_manual_time_block(id: i64) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let result = sqlx::query("DELETE FROM manual_time_blocks WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("Manual time block {id} does not exist").into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_table, validate, ManualTimeBlock};
    use sqlx::SqlitePool;

    #[test]
    fn validates_manual_time_block_fields() {
        assert!(validate("", None, 10, 20).is_err());
        assert!(validate("Work", None, 20, 20).is_err());
        let (title, notes) = validate("  Focus time  ", Some("  Notes  "), 10, 20).unwrap();
        assert_eq!(title, "Focus time");
        assert_eq!(notes.as_deref(), Some("Notes"));
    }

    #[tokio::test]
    async fn stores_and_finds_blocks_that_overlap_a_range() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        create_table(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO manual_time_blocks
             (title, notes, start_time, end_time, created_at, updated_at)
             VALUES ('Planning', 'Weekly plan', 100, 200, 1, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let rows = sqlx::query_as::<_, ManualTimeBlock>(
            "SELECT id, title, notes, start_time, end_time, created_at, updated_at
             FROM manual_time_blocks
             WHERE end_time > ?1 AND start_time < ?2",
        )
        .bind(150_i64)
        .bind(250_i64)
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Planning");
        assert_eq!(rows[0].notes.as_deref(), Some("Weekly plan"));
    }
}
