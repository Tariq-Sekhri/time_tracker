use super::manual_time_block::{RunningManualTimer, RUNNING_TIMER_KEY};
use crate::db::{self, Error};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow)]
pub struct ManualProject {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ManualCategory {
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
    pub parent_id: Option<i64>,
}

#[tauri::command]
pub async fn get_manual_categories() -> Result<Vec<ManualCategory>, Error> {
    let pool = db::get_pool().await?;
    categories_for_pool(&pool).await
}

pub(crate) async fn categories_for_pool(pool: &SqlitePool) -> Result<Vec<ManualCategory>, Error> {
    let metadata = sqlx::query_as::<_, (String, String)>(
        "SELECT key, value FROM app_metadata WHERE key LIKE 'manual_category_%'",
    ).fetch_all(pool).await?.into_iter().collect::<std::collections::HashMap<_, _>>();
    let palette = ["#0ea5e9", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee"];
    let mut categories = vec![ManualCategory {
        id: None,
        name: "Uncategorized".into(),
        color: metadata.get("manual_category_color:none").cloned().unwrap_or_else(|| palette[0].into()),
        parent_id: None,
    }];
    let color_for = |id: i64| metadata.get(&format!("manual_category_color:{id}")).cloned();
    for project in sqlx::query_as::<_, ManualProject>("SELECT id, name, parent_id FROM manual_projects ORDER BY name COLLATE NOCASE, id").fetch_all(pool).await? {
        // Subcategories share their parent's color until given their own.
        let color = color_for(project.id)
            .or_else(|| project.parent_id.and_then(color_for))
            .unwrap_or_else(|| palette[project.parent_id.unwrap_or(project.id) as usize % palette.len()].into());
        categories.push(ManualCategory { id: Some(project.id), name: project.name, color, parent_id: project.parent_id });
    }
    Ok(categories)
}

#[tauri::command]
pub async fn update_manual_category(id: Option<i64>, name: String, color: String) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    save_category(&pool, id, &name, &color).await?;
    crate::manual_sync::projects_changed_locally();
    Ok(())
}

async fn save_category(pool: &SqlitePool, id: Option<i64>, name: &str, color: &str) -> Result<(), Error> {
    let name = validate_name(name)?;
    if id.is_none() && name != "Uncategorized" {
        return Err(anyhow::anyhow!("Uncategorized cannot be renamed").into());
    }
    if color.len() != 7 || !color.starts_with('#') || !color[1..].bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(anyhow::anyhow!("Choose a valid hex color").into());
    }
    let mut tx = pool.begin().await?;
    if let Some(id) = id {
        let result = sqlx::query("UPDATE manual_projects SET name = ?1 WHERE id = ?2").bind(name).bind(id).execute(&mut *tx).await.map_err(name_taken)?;
        if result.rows_affected() == 0 { return Err(anyhow::anyhow!("Project no longer exists").into()); }
    }
    let key = format!("manual_category_color:{}", id.map(|id| id.to_string()).unwrap_or_else(|| "none".into()));
    sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)").bind(key).bind(color.to_ascii_lowercase()).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

/// Joins a category and subcategory into the single name used for sync, e.g. "School › Homework".
pub(crate) const PATH_SEPARATOR: &str = " › ";

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("CREATE TABLE IF NOT EXISTS manual_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE, parent_id INTEGER)")
        .execute(pool).await?;
    ensure_schema(pool).await
}

/// Names only need to be unique among siblings, so "School › Homework" and
/// "Coding › Homework" can coexist. Older databases made every name unique.
pub async fn ensure_schema(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let sql: Option<String> = sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'manual_projects'")
        .fetch_optional(pool).await?;
    if sql.is_some_and(|sql| sql.to_ascii_uppercase().contains("UNIQUE")) {
        let mut transaction = pool.begin().await?;
        sqlx::query("CREATE TABLE manual_projects_rebuild (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE, parent_id INTEGER)")
            .execute(&mut *transaction).await?;
        sqlx::query("INSERT INTO manual_projects_rebuild (id, name, parent_id) SELECT id, name, parent_id FROM manual_projects")
            .execute(&mut *transaction).await?;
        sqlx::query("DROP TABLE manual_projects").execute(&mut *transaction).await?;
        sqlx::query("ALTER TABLE manual_projects_rebuild RENAME TO manual_projects").execute(&mut *transaction).await?;
        transaction.commit().await?;
    }
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_projects_sibling_name ON manual_projects (IFNULL(parent_id, 0), name COLLATE NOCASE)")
        .execute(pool).await?;
    Ok(())
}

fn name_taken(error: sqlx::Error) -> Error {
    match &error {
        sqlx::Error::Database(database) if database.is_unique_violation() => {
            anyhow::anyhow!("A category with this name already exists here").into()
        }
        _ => error.into(),
    }
}

fn validate_name(name: &str) -> Result<&str, Error> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(anyhow::anyhow!("Project name must be between 1 and 100 characters").into());
    }
    if name.contains('›') {
        return Err(anyhow::anyhow!("Category names cannot contain ›").into());
    }
    Ok(name)
}

/// The name other devices know this category by: "Parent › Child" for subcategories.
pub(crate) async fn sync_name(pool: &SqlitePool, id: Option<i64>) -> Result<Option<String>, Error> {
    let Some(id) = id else { return Ok(None) };
    Ok(sqlx::query_scalar(
        "SELECT CASE WHEN parent.name IS NULL THEN p.name ELSE parent.name || ?2 || p.name END
         FROM manual_projects p LEFT JOIN manual_projects parent ON parent.id = p.parent_id WHERE p.id = ?1",
    )
    .bind(id)
    .bind(PATH_SEPARATOR)
    .fetch_optional(pool)
    .await?)
}

/// Resolves a synced name, creating the category and subcategory when missing.
pub(crate) async fn id_for_sync_name(pool: &SqlitePool, name: Option<&str>) -> Result<Option<i64>, Error> {
    let Some(name) = name.map(str::trim).filter(|name| !name.is_empty()) else {
        return Ok(None);
    };
    let (parent, child) = match name.split_once(PATH_SEPARATOR.trim()) {
        Some((parent, child)) if !parent.trim().is_empty() && !child.trim().is_empty() => (Some(parent.trim()), child.trim()),
        _ => (None, name),
    };
    let parent_id = match parent {
        Some(parent) => Some(find_or_create(pool, parent, None).await?),
        None => None,
    };
    Ok(Some(find_or_create(pool, child, parent_id).await?))
}

async fn find_or_create(pool: &SqlitePool, name: &str, parent_id: Option<i64>) -> Result<i64, Error> {
    sqlx::query("INSERT OR IGNORE INTO manual_projects (name, parent_id) VALUES (?1, ?2)")
        .bind(name).bind(parent_id).execute(pool).await?;
    Ok(sqlx::query_scalar("SELECT id FROM manual_projects WHERE name = ?1 AND parent_id IS ?2")
        .bind(name).bind(parent_id).fetch_one(pool).await?)
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
        "SELECT id, name, parent_id FROM manual_projects ORDER BY name COLLATE NOCASE, id",
    )
    .fetch_all(&pool)
    .await?)
}

#[tauri::command]
pub async fn create_manual_project(name: String, parent_id: Option<i64>) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let id = create_project(&pool, &name, parent_id).await?;
    crate::manual_sync::projects_changed_locally();
    Ok(id)
}

async fn create_project(pool: &SqlitePool, name: &str, parent_id: Option<i64>) -> Result<i64, Error> {
    let name = validate_name(name)?;
    if let Some(parent_id) = parent_id {
        // Only one level of nesting: a parent must itself be top-level.
        let parent = sqlx::query_scalar::<_, Option<i64>>("SELECT parent_id FROM manual_projects WHERE id = ?1")
            .bind(parent_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Parent category no longer exists"))?;
        if parent.is_some() {
            return Err(anyhow::anyhow!("Subcategories cannot have their own subcategories").into());
        }
    }
    let result = sqlx::query("INSERT INTO manual_projects (name, parent_id) VALUES (?1, ?2)")
        .bind(name)
        .bind(parent_id)
        .execute(pool)
        .await
        .map_err(name_taken)?;
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
        .await
        .map_err(name_taken)?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("Project no longer exists").into());
    }
    crate::manual_sync::projects_changed_locally();
    Ok(())
}

#[tauri::command]
pub async fn delete_manual_project(id: i64) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    delete_project(&pool, id).await
}

/// Deleting a subcategory moves its time to the parent category; deleting a
/// category also removes its subcategories and leaves all of that time uncategorized.
async fn delete_project(pool: &SqlitePool, id: i64) -> Result<(), Error> {
    let mut transaction = pool.begin().await?;
    let parent_id = sqlx::query_scalar::<_, Option<i64>>("SELECT parent_id FROM manual_projects WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Project no longer exists"))?;
    let mut removed = sqlx::query_scalar::<_, i64>("SELECT id FROM manual_projects WHERE parent_id = ?1")
        .bind(id)
        .fetch_all(&mut *transaction)
        .await?;
    removed.push(id);
    for removed_id in &removed {
        sqlx::query(
            "UPDATE manual_time_blocks SET project_id = ?1, updated_at = ?2 WHERE project_id = ?3",
        )
        .bind(parent_id)
        .bind(chrono::Utc::now().timestamp())
        .bind(removed_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM manual_projects WHERE id = ?1")
            .bind(removed_id)
            .execute(&mut *transaction)
            .await?;
    }
    if let Some(value) =
        sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = ?1")
            .bind(RUNNING_TIMER_KEY)
            .fetch_optional(&mut *transaction)
            .await?
    {
        let mut timer: RunningManualTimer =
            serde_json::from_str(&value).map_err(anyhow::Error::new)?;
        if timer.project_id.is_some_and(|project_id| removed.contains(&project_id)) {
            timer.project_id = parent_id;
            sqlx::query("UPDATE app_metadata SET value = ?1 WHERE key = ?2")
                .bind(serde_json::to_string(&timer).map_err(anyhow::Error::new)?)
                .bind(RUNNING_TIMER_KEY)
                .execute(&mut *transaction)
                .await?;
        }
    }
    transaction.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn category_edits_persist_and_duplicate_names_do_not_partially_save() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        create_table(&pool).await.unwrap();
        sqlx::query("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO manual_projects (id, name) VALUES (1, 'Client'), (2, 'Other')").execute(&pool).await.unwrap();
        save_category(&pool, Some(1), "Renamed", "#FB7185").await.unwrap();
        assert!(save_category(&pool, None, "Personal", "#34d399").await.is_err());
        save_category(&pool, None, "Uncategorized", "#34d399").await.unwrap();
        assert!(save_category(&pool, Some(1), "Other", "#22d3ee").await.is_err());
        assert!(save_category(&pool, Some(1), "Renamed", "invalid").await.is_err());
        let categories = categories_for_pool(&pool).await.unwrap();
        let category = categories.iter().find(|category| category.id == Some(1)).unwrap();
        assert_eq!(category.name, "Renamed");
        assert_eq!(category.color, "#fb7185");
        assert_eq!(categories[0].id, None);
        assert_eq!(categories[0].name, "Uncategorized");
        assert_eq!(categories[0].color, "#34d399");
    }

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
            ..Default::default()
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

    #[tokio::test]
    async fn subcategories_nest_one_level_and_fold_into_their_parent_on_delete() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        create_table(&pool).await.unwrap();
        super::super::manual_time_block::create_table(&pool).await.unwrap();
        sqlx::query("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)").execute(&pool).await.unwrap();
        let school = create_project(&pool, "School", None).await.unwrap();
        let homework = create_project(&pool, "Homework", Some(school)).await.unwrap();
        let study = create_project(&pool, "Study", Some(school)).await.unwrap();
        assert!(create_project(&pool, "Too deep", Some(homework)).await.is_err());
        assert!(create_project(&pool, "Orphan", Some(999)).await.is_err());
        save_category(&pool, Some(school), "School", "#fb7185").await.unwrap();
        let categories = categories_for_pool(&pool).await.unwrap();
        let child = categories.iter().find(|category| category.id == Some(homework)).unwrap();
        assert_eq!((child.parent_id, child.color.as_str()), (Some(school), "#fb7185"));

        sqlx::query("INSERT INTO manual_time_blocks (title, project_id, start_time, end_time, created_at, updated_at) VALUES ('Essay', ?1, 100, 200, 1, 1), ('Flashcards', ?2, 200, 300, 1, 1)")
            .bind(homework).bind(study).execute(&pool).await.unwrap();
        delete_project(&pool, homework).await.unwrap();
        let essay: Option<i64> = sqlx::query_scalar("SELECT project_id FROM manual_time_blocks WHERE title = 'Essay'").fetch_one(&pool).await.unwrap();
        assert_eq!(essay, Some(school));

        delete_project(&pool, school).await.unwrap();
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM manual_projects").fetch_one(&pool).await.unwrap();
        assert_eq!(remaining, 0);
        let orphaned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM manual_time_blocks WHERE project_id IS NULL").fetch_one(&pool).await.unwrap();
        assert_eq!(orphaned, 2);
    }

    #[tokio::test]
    async fn sibling_names_are_unique_and_sync_names_round_trip() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE manual_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE)").execute(&pool).await.unwrap();
        sqlx::query("ALTER TABLE manual_projects ADD COLUMN parent_id INTEGER").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO manual_projects (id, name) VALUES (4, 'School')").execute(&pool).await.unwrap();
        create_table(&pool).await.unwrap();
        create_table(&pool).await.unwrap();

        let coding = create_project(&pool, "Coding", None).await.unwrap();
        let school_homework = create_project(&pool, "Homework", Some(4)).await.unwrap();
        let coding_homework = create_project(&pool, "homework", Some(coding)).await.unwrap();
        assert_ne!(school_homework, coding_homework);
        assert!(create_project(&pool, "HOMEWORK", Some(4)).await.is_err());
        assert!(create_project(&pool, "school", None).await.is_err());
        assert!(create_project(&pool, "A › B", None).await.is_err());

        assert_eq!(sync_name(&pool, Some(school_homework)).await.unwrap().as_deref(), Some("School › Homework"));
        assert_eq!(sync_name(&pool, Some(4)).await.unwrap().as_deref(), Some("School"));
        assert_eq!(id_for_sync_name(&pool, Some("School › Homework")).await.unwrap(), Some(school_homework));
        assert_eq!(id_for_sync_name(&pool, Some("school")).await.unwrap(), Some(4));
        let created = id_for_sync_name(&pool, Some("Gym › Legs")).await.unwrap().unwrap();
        assert_eq!(sync_name(&pool, Some(created)).await.unwrap().as_deref(), Some("Gym › Legs"));
        assert_eq!(id_for_sync_name(&pool, Some("  ")).await.unwrap(), None);
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
