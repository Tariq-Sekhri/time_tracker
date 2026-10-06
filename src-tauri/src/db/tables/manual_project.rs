use super::manual_time_block::{RunningManualTimer, RUNNING_TIMER_KEY};
use crate::db::{self, Error};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow)]
pub struct ManualProject {
    pub id: i64,
    pub name: String,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("CREATE TABLE IF NOT EXISTS manual_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE)")
        .execute(pool).await?;
    Ok(())
}

fn validate_name(name: &str) -> Result<&str, Error> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(anyhow::anyhow!("Project name must be between 1 and 100 characters").into());
    }
    Ok(name)
}

pub async fn validate_project_id(pool: &SqlitePool, project_id: Option<i64>) -> Result<(), Error> {
    if let Some(id) = project_id {
        let exists =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM manual_projects WHERE id = ?1")
                .bind(id)
                .fetch_one(pool)
                .await?;
        if exists == 0 {
            return Err(anyhow::anyhow!("Project no longer exists").into());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_manual_projects() -> Result<Vec<ManualProject>, Error> {
    let pool = db::get_pool().await?;
    Ok(sqlx::query_as::<_, ManualProject>(
        "SELECT id, name FROM manual_projects ORDER BY name COLLATE NOCASE, id",
    )
    .fetch_all(&pool)
    .await?)
}

#[tauri::command]
pub async fn create_manual_project(name: String) -> Result<i64, Error> {
    let name = validate_name(&name)?;
    let pool = db::get_pool().await?;
    let result = sqlx::query("INSERT INTO manual_projects (name) VALUES (?1)")
        .bind(name)
        .execute(&pool)
        .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_manual_project(id: i64, name: String) -> Result<(), Error> {
    let name = validate_name(&name)?;
    let pool = db::get_pool().await?;
    let result = sqlx::query("UPDATE manual_projects SET name = ?1 WHERE id = ?2")
        .bind(name)
        .bind(id)
        .execute(&pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("Project no longer exists").into());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_manual_project(id: i64) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    delete_project(&pool, id).await
}

async fn delete_project(pool: &SqlitePool, id: i64) -> Result<(), Error> {
    let mut transaction = pool.begin().await?;
    sqlx::query(
        "UPDATE manual_time_blocks SET project_id = NULL, updated_at = ?1 WHERE project_id = ?2",
    )
    .bind(chrono::Utc::now().timestamp())
    .bind(id)
    .execute(&mut *transaction)
    .await?;
    if let Some(value) =
        sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
            .bind(RUNNING_TIMER_KEY)
            .fetch_optional(&mut *transaction)
            .await?
    {
        let mut timer: RunningManualTimer =
            serde_json::from_str(&value).map_err(anyhow::Error::new)?;
        if timer.project_id == Some(id) {
            timer.project_id = None;
            sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?2")
                .bind(serde_json::to_string(&timer).map_err(anyhow::Error::new)?)
                .bind(RUNNING_TIMER_KEY)
                .execute(&mut *transaction)
                .await?;
        }
    }
    let result = sqlx::query("DELETE FROM manual_projects WHERE id = ?1")
        .bind(id)
        .execute(&mut *transaction)
        .await?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("Project no longer exists").into());
    }
    transaction.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn deleting_a_project_keeps_recorded_and_running_time() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        create_table(&pool).await.unwrap();
        super::super::manual_time_block::create_table(&pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO manual_projects (id, name) VALUES (1, 'Client')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO manual_time_blocks (title, notes, project_id, start_time, end_time, created_at, updated_at) VALUES ('Planning', 'Keep notes', 1, 100, 200, 1, 1)").execute(&pool).await.unwrap();
        let timer = RunningManualTimer {
            title: "Current work".into(),
            notes: Some("Timer notes".into()),
            project_id: Some(1),
            start_time: 250,
            end_time: None,
        };
        sqlx::query("INSERT INTO app_metadata (key, value) VALUES (?1, ?2)")
            .bind(RUNNING_TIMER_KEY)
            .bind(serde_json::to_string(&timer).unwrap())
            .execute(&pool)
            .await
            .unwrap();

        delete_project(&pool, 1).await.unwrap();
        let block = sqlx::query_as::<_, super::super::manual_time_block::ManualTimeBlock>(
            "SELECT * FROM manual_time_blocks",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(block.project_id, None);
        assert_eq!(block.notes.as_deref(), Some("Keep notes"));
        assert_eq!((block.start_time, block.end_time), (100, 200));
        let value: String = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = ?1")
            .bind(RUNNING_TIMER_KEY)
            .fetch_one(&pool)
            .await
            .unwrap();
        let current: RunningManualTimer = serde_json::from_str(&value).unwrap();
        assert_eq!(current.project_id, None);
        assert_eq!(current.start_time, 250);
        assert_eq!(current.end_time, None);
        assert_eq!(current.title, "Current work");
        assert_eq!(current.notes.as_deref(), Some("Timer notes"));
        assert!(validate_project_id(&pool, Some(1)).await.is_err());
    }

    #[test]
    fn legacy_timer_without_a_project_still_loads() {
        let timer: RunningManualTimer = serde_json::from_str(
            r#"{"title":"Existing work","notes":null,"start_time":100,"end_time":null}"#,
        )
        .unwrap();
        assert_eq!(timer.project_id, None);
        assert_eq!(timer.title, "Existing work");
    }
}
