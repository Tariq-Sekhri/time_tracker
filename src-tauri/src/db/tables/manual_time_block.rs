use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

pub(crate) const RUNNING_TIMER_KEY: &str = "running_manual_time_timer_v1";

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ManualTimeBlock {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub project_id: Option<i64>,
    #[sqlx(default)]
    #[serde(default)]
    pub project_name: Option<String>,
    /// Set for subcategories; statistics roll their time up into this category.
    #[sqlx(default)]
    #[serde(default)]
    pub parent_project_name: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewManualTimeBlock {
    pub title: String,
    pub notes: Option<String>,
    pub project_id: Option<i64>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateManualTimeBlock {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub project_id: Option<i64>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RunningManualTimer {
    pub title: String,
    pub notes: Option<String>,
    #[serde(default)]
    pub project_id: Option<i64>,
    pub start_time: i64,
    #[serde(default)]
    pub end_time: Option<i64>,
    /// Identifies this timer on the sync server so every device can stop it.
    #[serde(default)]
    pub session_id: Option<String>,
    /// The sync server holds this exact state; false while local edits are unsent.
    #[serde(default)]
    pub synced: bool,
    /// Last server version applied, so stale pushes never undo newer edits.
    #[serde(default)]
    pub version: i64,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS manual_time_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            project_id INTEGER,
            start_time INTEGER NOT NULL,
            end_time INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            session_id TEXT,
            pending_upload INTEGER NOT NULL DEFAULT 0
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
    let title = if title.is_empty() { "Unnamed" } else { title };
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
    let mut blocks = sqlx::query_as::<_, ManualTimeBlock>(
        "SELECT b.id, b.title, b.notes, b.project_id, p.name AS project_name, parent.name AS parent_project_name, b.start_time, b.end_time, b.created_at, b.updated_at
         FROM manual_time_blocks b LEFT JOIN manual_projects p ON p.id = b.project_id
         LEFT JOIN manual_projects parent ON parent.id = p.parent_id
         WHERE b.end_time > ?1 AND b.start_time < ?2
         ORDER BY b.start_time, b.id",
    )
    .bind(range_start)
    .bind(range_end)
    .fetch_all(&pool)
    .await?;
    for block in &mut blocks {
        if block.project_id.is_none() { block.project_name = Some("Uncategorized".into()); }
    }
    Ok(blocks)
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
    super::manual_project::validate_project_id(&pool, new_manual_time_block.project_id).await?;
    let result = sqlx::query(
        "INSERT INTO manual_time_blocks
         (title, notes, start_time, end_time, created_at, updated_at, project_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)",
    )
    .bind(title)
    .bind(notes)
    .bind(new_manual_time_block.start_time)
    .bind(new_manual_time_block.end_time)
    .bind(now)
    .bind(new_manual_time_block.project_id)
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
pub async fn start_manual_timer(
    title: Option<String>,
    project_id: Option<i64>,
) -> Result<RunningManualTimer, Error> {
    let title = title.unwrap_or_default().trim().to_string();
    if title.chars().count() > 200 {
        return Err(anyhow::anyhow!("Title must be 200 characters or fewer").into());
    }
    let timer = RunningManualTimer {
        title,
        notes: None,
        project_id,
        start_time: chrono::Utc::now().timestamp(),
        end_time: None,
        session_id: Some(uuid::Uuid::new_v4().to_string()),
        synced: false,
        version: 0,
    };
    let pool = db::get_pool().await?;
    super::manual_project::validate_project_id(&pool, project_id).await?;
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
    crate::manual_sync::timer_changed_locally();
    Ok(timer)
}

#[tauri::command]
pub async fn update_manual_timer_details(
    title: String,
    project_id: Option<i64>,
    start_time: Option<i64>,
) -> Result<RunningManualTimer, Error> {
    let pool = db::get_pool().await?;
    let timer = update_manual_timer_details_in_pool(&pool, title, project_id, start_time).await?;
    crate::manual_sync::timer_changed_locally();
    Ok(timer)
}

async fn update_manual_timer_details_in_pool(
    pool: &SqlitePool,
    title: String,
    project_id: Option<i64>,
    start_time: Option<i64>,
) -> Result<RunningManualTimer, Error> {
    let title = title.trim();
    if title.chars().count() > 200 {
        return Err(anyhow::anyhow!("Timer name must be 200 characters or fewer").into());
    }
    super::manual_project::validate_project_id(pool, project_id).await?;
    // Reserve the writer before reading: tracking/sync writes must not make
    // this snapshot stale when we update it (SQLITE_BUSY_SNAPSHOT / 517).
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| anyhow::anyhow!("No manual timer is running"))?;
    let mut timer: RunningManualTimer = serde_json::from_str(&value).map_err(anyhow::Error::new)?;
    if let Some(start) = start_time {
        if start > chrono::Utc::now().timestamp() {
            return Err(anyhow::anyhow!("Start time cannot be in the future").into());
        }
        if timer.end_time.is_some_and(|end| start >= end) {
            return Err(anyhow::anyhow!("Start time must be before the end time").into());
        }
        timer.start_time = start;
    }
    timer.title = title.to_string();
    timer.project_id = project_id;
    timer.synced = false;
    sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?2")
        .bind(serde_json::to_string(&timer).map_err(anyhow::Error::new)?)
        .bind(RUNNING_TIMER_KEY)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(timer)
}

#[tauri::command]
pub async fn update_manual_timer_title(title: String) -> Result<RunningManualTimer, Error> {
    let title = title.trim();
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
    timer.synced = false;
    let value = serde_json::to_string(&timer).map_err(anyhow::Error::new)?;
    sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?2")
        .bind(value)
        .bind(RUNNING_TIMER_KEY)
        .execute(&pool)
        .await?;
    crate::manual_sync::timer_changed_locally();
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
    let id = finish_manual_timer_in_pool(&pool).await?;
    crate::manual_sync::entries_changed_locally();
    Ok(id)
}

async fn finish_manual_timer_in_pool(pool: &SqlitePool) -> Result<i64, Error> {
    // Wait for an existing writer before taking the timer snapshot. Once
    // acquired, the insert and timer removal stay atomic with no lock upgrade.
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(RUNNING_TIMER_KEY)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| anyhow::anyhow!("No manual timer is running"))?;
    let timer: RunningManualTimer = serde_json::from_str(&value).map_err(anyhow::Error::new)?;
    let end_time = timer
        .end_time
        .ok_or_else(|| anyhow::anyhow!("Stop the timer before recording it"))?;
    let now = chrono::Utc::now().timestamp();
    // The session ID lets other devices recognise this block when it syncs back.
    let result = sqlx::query(
        "INSERT INTO manual_time_blocks
         (title, notes, start_time, end_time, created_at, updated_at, project_id, session_id, pending_upload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8)",
    )
    .bind(if timer.title.trim().is_empty() { "Unnamed" } else { timer.title.trim() })
    .bind(timer.notes)
    .bind(timer.start_time)
    .bind(end_time)
    .bind(now)
    .bind(timer.project_id)
    .bind(&timer.session_id)
    .bind(timer.session_id.is_some())
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
    super::manual_project::validate_project_id(&pool, manual_time_block.project_id).await?;
    let result = sqlx::query(
        "UPDATE manual_time_blocks
         SET title = ?1, notes = ?2, start_time = ?3, end_time = ?4, updated_at = ?5, project_id = ?7
         WHERE id = ?6",
    )
    .bind(title)
    .bind(notes)
    .bind(manual_time_block.start_time)
    .bind(manual_time_block.end_time)
    .bind(chrono::Utc::now().timestamp())
    .bind(manual_time_block.id)
    .bind(manual_time_block.project_id)
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
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
    use sqlx::SqlitePool;
    use std::time::Duration;

    async fn wal_pool() -> (SqlitePool, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!("manual-save-{}.db", uuid::Uuid::new_v4()));
        let pool = SqlitePoolOptions::new()
            .max_connections(3)
            .connect_with(SqliteConnectOptions::new().filename(&path).create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal).busy_timeout(Duration::from_secs(5)))
            .await.unwrap();
        sqlx::query("CREATE TABLE app_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            .execute(&pool).await.unwrap();
        create_table(&pool).await.unwrap();
        let timer = RunningManualTimer {
            title: "Planning".into(), notes: Some("Keep notes".into()), start_time: 100,
            end_time: Some(200), session_id: Some("test-session".into()), ..Default::default()
        };
        sqlx::query("INSERT INTO app_metadata VALUES (?1, ?2)")
            .bind(RUNNING_TIMER_KEY).bind(serde_json::to_string(&timer).unwrap())
            .execute(&pool).await.unwrap();
        (pool, path)
    }

    async fn cleanup(pool: SqlitePool, path: std::path::PathBuf) {
        pool.close().await;
        std::fs::remove_file(path).unwrap();
    }

    #[tokio::test]
    async fn deferred_read_then_write_reproduces_snapshot_error() {
        let (pool, path) = wal_pool().await;
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("SELECT value FROM app_metadata").fetch_all(&mut *tx).await.unwrap();
        sqlx::query("INSERT INTO app_metadata VALUES ('background', 'write')")
            .execute(&pool).await.unwrap();
        let error = sqlx::query("DELETE FROM app_metadata WHERE key = ?1")
            .bind(RUNNING_TIMER_KEY).execute(&mut *tx).await.unwrap_err();
        assert_eq!(error.as_database_error().unwrap().code().as_deref(), Some("517"));
        tx.rollback().await.unwrap();
        cleanup(pool.clone(), path).await;
    }

    #[tokio::test]
    async fn manual_save_waits_for_background_writer_and_records_once() {
        let (pool, path) = wal_pool().await;
        let mut writer = pool.begin_with("BEGIN IMMEDIATE").await.unwrap();
        // Model a sync update that has not committed when the user clicks Save.
        let raw: String = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = ?1")
            .bind(RUNNING_TIMER_KEY).fetch_one(&mut *writer).await.unwrap();
        let mut timer: RunningManualTimer = serde_json::from_str(&raw).unwrap();
        timer.version = 42;
        sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?2")
            .bind(serde_json::to_string(&timer).unwrap()).bind(RUNNING_TIMER_KEY)
            .execute(&mut *writer).await.unwrap();
        let update = update_manual_timer_details_in_pool(&pool, "Updated".into(), None, None);
        tokio::pin!(update);
        assert!(tokio::time::timeout(Duration::from_millis(100), &mut update).await.is_err());
        writer.commit().await.unwrap();
        let updated = update.await.unwrap();
        assert_eq!(updated.version, 42);
        assert_eq!(updated.title, "Updated");
        assert_eq!(updated.notes.as_deref(), Some("Keep notes"));

        let mut writer = pool.begin_with("BEGIN IMMEDIATE").await.unwrap();
        sqlx::query("INSERT INTO app_metadata VALUES ('background', 'write')")
            .execute(&mut *writer).await.unwrap();
        let finish = finish_manual_timer_in_pool(&pool);
        tokio::pin!(finish);
        assert!(tokio::time::timeout(Duration::from_millis(100), &mut finish).await.is_err());
        writer.commit().await.unwrap();
        let id = finish.await.unwrap();
        let row: (String, Option<String>, i64, i64, String, i64) = sqlx::query_as(
            "SELECT title, notes, start_time, end_time, session_id, pending_upload FROM manual_time_blocks WHERE id = ?1")
            .bind(id).fetch_one(&pool).await.unwrap();
        assert_eq!(row, ("Updated".into(), Some("Keep notes".into()), 100, 200, "test-session".into(), 1));
        assert!(finish_manual_timer_in_pool(&pool).await.is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM manual_time_blocks")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(count, 1);
        let timer_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_metadata WHERE key = ?1")
            .bind(RUNNING_TIMER_KEY).fetch_one(&pool).await.unwrap();
        assert_eq!(timer_count, 0);
        cleanup(pool.clone(), path).await;
    }

    #[test]
    fn validates_manual_time_block_fields() {
        assert_eq!(validate("", None, 10, 20).unwrap().0, "Unnamed");
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
            "SELECT id, title, notes, project_id, start_time, end_time, created_at, updated_at
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
