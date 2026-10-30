use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize)]
pub struct Category {
    pub id: i32,
    pub name: String,
    pub priority: i32,
    #[serde(default)]
    pub color: Option<String>,
    pub regex_enabled: bool,
    pub is_visible: bool,
    pub in_stats: bool,
    pub is_collapsed: bool,
    /// Subcategories match on their own but roll up into this category.
    #[serde(default)]
    pub parent_id: Option<i32>,
}

const COLUMNS: &str = "id, name, priority, color, regex_enabled, is_visible, in_stats, is_collapsed, parent_id";
const FALLBACK_CATEGORY: &str = "Miscellaneous";

#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategory {
    name: String,
    priority: i32,
    color: Option<String>,
    regex_enabled: bool,
    is_visible: bool,
    in_stats: bool,
    is_collapsed: bool,
    #[serde(default)]
    parent_id: Option<i32>,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            priority INTEGER,
            color TEXT,
            regex_enabled INTEGER NOT NULL DEFAULT 1,
            is_visible INTEGER NOT NULL DEFAULT 1,
            in_stats INTEGER NOT NULL DEFAULT 1,
            is_collapsed INTEGER NOT NULL DEFAULT 1,
            parent_id INTEGER
        );",
    )
    .execute(pool)
    .await?;
    ensure_schema(pool).await?;

    let row = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM category")
        .fetch_one(pool)
        .await?;

    if row == 0 {
        let defaults: &[(&str, i32, Option<&str>, bool, bool, bool, bool)] = &[
            ("Miscellaneous", 0, Some("#9c9c9c"), true, true, true, false),
            ("Hidden", 100, Some("#475569"), true, true, true, false),
            ("Browsing", 200, Some("#ff7300"), true, true, true, false),
            ("Music", 250, Some("#ec4899"), true, true, true, false),
            ("Reading", 300, Some("#a855f7"), true, true, true, false),
            ("Coding", 400, Some("#1100ff"), true, true, true, false),
            ("Gaming", 500, Some("#2eff89"), true, true, true, false),
            ("Watching", 600, Some("#fff700"), true, true, true, false),
            ("Social", 700, Some("#5662f6"), true, true, true, false),
        ];

        for (name, priority, color, regex_enabled, is_visible, in_stats, is_collapsed) in defaults {
            sqlx::query(
                "INSERT OR IGNORE INTO category (
                    name,
                    priority,
                    color,
                    regex_enabled,
                    is_visible,
                    in_stats,
                    is_collapsed
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .bind(name)
            .bind(priority)
            .bind(color)
            .bind(regex_enabled)
            .bind(is_visible)
            .bind(in_stats)
            .bind(is_collapsed)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

/// Names only need to be unique among siblings, so "Work › Email" and
/// "Personal › Email" can coexist. Older databases made every name unique.
pub async fn ensure_schema(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let sql: Option<String> = sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'category'")
        .fetch_optional(pool).await?;
    if sql.is_some_and(|sql| sql.to_ascii_uppercase().contains("UNIQUE")) {
        // Column sets vary across old databases; anything unknown is legacy and already migrated.
        let existing: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('category')").fetch_all(pool).await?;
        let shared = COLUMNS.split(", ").filter(|column| existing.iter().any(|name| name == column)).collect::<Vec<_>>().join(", ");
        let mut transaction = pool.begin().await?;
        sqlx::query(
            "CREATE TABLE category_rebuild (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                priority INTEGER,
                color TEXT,
                regex_enabled INTEGER NOT NULL DEFAULT 1,
                is_visible INTEGER NOT NULL DEFAULT 1,
                in_stats INTEGER NOT NULL DEFAULT 1,
                is_collapsed INTEGER NOT NULL DEFAULT 1,
                parent_id INTEGER
            )",
        ).execute(&mut *transaction).await?;
        sqlx::query(sqlx::AssertSqlSafe(format!("INSERT INTO category_rebuild ({shared}) SELECT {shared} FROM category")))
            .execute(&mut *transaction).await?;
        sqlx::query("DROP TABLE category").execute(&mut *transaction).await?;
        sqlx::query("ALTER TABLE category_rebuild RENAME TO category").execute(&mut *transaction).await?;
        transaction.commit().await?;
    }
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_category_sibling_name ON category (IFNULL(parent_id, 0), name)")
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

#[tauri::command]
pub async fn insert_category(new_category: NewCategory) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    insert_into(&pool, new_category).await
}

async fn insert_into(pool: &SqlitePool, new_category: NewCategory) -> Result<i64, Error> {
    let mut color = new_category.color.clone();
    if let Some(parent_id) = new_category.parent_id {
        if new_category.name == FALLBACK_CATEGORY {
            return Err(anyhow::anyhow!("{FALLBACK_CATEGORY} cannot be a subcategory").into());
        }
        // Only one level of nesting: a parent must itself be top-level.
        let (grandparent, parent_color) = sqlx::query_as::<_, (Option<i32>, Option<String>)>("SELECT parent_id, color FROM category WHERE id = ?1")
            .bind(parent_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Parent category no longer exists"))?;
        if grandparent.is_some() {
            return Err(anyhow::anyhow!("Subcategories cannot have their own subcategories").into());
        }
        color = color.or(parent_color);
    }
    let result = sqlx::query(
        "INSERT INTO category (
            name,
            priority,
            color,
            regex_enabled,
            is_visible,
            in_stats,
            is_collapsed,
            parent_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(&new_category.name)
    .bind(new_category.priority)
    .bind(&color)
    .bind(new_category.regex_enabled)
    .bind(new_category.is_visible)
    .bind(new_category.in_stats)
    .bind(new_category.is_collapsed)
    .bind(new_category.parent_id)
    .execute(pool)
    .await
    .map_err(name_taken)?;

    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn get_category_by_id(id: i32) -> Result<Category, Error> {
    let pool = db::get_pool().await?;
    let cat = sqlx::query_as::<_, Category>(
        r#"
        SELECT
            id,
            name,
            priority,
            color,
            regex_enabled,
            is_visible,
            in_stats,
            is_collapsed,
            parent_id
        FROM category
        WHERE id = ?1
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await?;

    Ok(cat)
}

#[tauri::command]
pub async fn get_categories() -> Result<Vec<Category>, Error> {
    let pool = db::get_pool().await?;
    let cats = sqlx::query_as::<_, Category>(
        r#"
        SELECT
            id,
            name,
            priority,
            color,
            regex_enabled,
            is_visible,
            in_stats,
            is_collapsed,
            parent_id
        FROM category
        ORDER BY priority DESC
        "#,
    )
    .fetch_all(&pool)
    .await?;

    Ok(cats)
}

#[tauri::command]
pub async fn update_category_by_id(cat: Category) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let current = get_category_by_id(cat.id).await.ok();

    if let Some(ref c) = current {
        if c.parent_id.is_some() && cat.name == FALLBACK_CATEGORY {
            return Err(anyhow::anyhow!("{FALLBACK_CATEGORY} cannot be a subcategory").into());
        }
        if c.name == FALLBACK_CATEGORY && c.parent_id.is_none() {
            sqlx::query(
                "UPDATE category
                 SET name = ?1,
                     priority = 0,
                     color = ?2,
                     regex_enabled = ?3,
                     is_visible = ?4,
                     in_stats = ?5,
                     is_collapsed = ?6
                 WHERE id = ?7",
            )
            .bind(&cat.name)
            .bind(&cat.color)
            .bind(cat.regex_enabled)
            .bind(cat.is_visible)
            .bind(cat.in_stats)
            .bind(cat.is_collapsed)
            .bind(cat.id)
            .execute(&pool)
            .await
            .map_err(name_taken)?;

            return Ok(());
        }
    }

    sqlx::query(
        "UPDATE category
         SET name = ?1,
             priority = ?2,
             color = ?3,
             regex_enabled = ?4,
             is_visible = ?5,
             in_stats = ?6,
             is_collapsed = ?7
         WHERE id = ?8",
    )
    .bind(&cat.name)
    .bind(cat.priority)
    .bind(&cat.color)
    .bind(cat.regex_enabled)
    .bind(cat.is_visible)
    .bind(cat.in_stats)
    .bind(cat.is_collapsed)
    .bind(cat.id)
    .execute(&pool)
    .await
    .map_err(name_taken)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_category_by_id(id: i32, cascade: bool) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    delete_from(&pool, id, cascade).await
}

/// Deleting a subcategory hands its rules to the parent; deleting a category
/// also removes its subcategories and sends all of their rules to Miscellaneous.
async fn delete_from(pool: &SqlitePool, id: i32, cascade: bool) -> Result<(), Error> {
    let mut tx = pool.begin().await?;
    let current = sqlx::query_as::<_, (String, Option<i32>)>("SELECT name, parent_id FROM category WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let parent_id = current.as_ref().and_then(|(_, parent_id)| *parent_id);

    if current.as_ref().is_some_and(|(name, parent_id)| name == FALLBACK_CATEGORY && parent_id.is_none()) {
        return Err(anyhow::anyhow!("The Miscellaneous category cannot be deleted.").into());
    }

    let mut removed = sqlx::query_scalar::<_, i32>("SELECT id FROM category WHERE parent_id = ?1")
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
    removed.push(id);

    let heir = match parent_id {
        Some(parent_id) => Some(parent_id),
        None => sqlx::query_scalar("SELECT id FROM category WHERE name = ?1 AND parent_id IS NULL")
            .bind(FALLBACK_CATEGORY)
            .fetch_optional(&mut *tx)
            .await?,
    };

    for removed_id in &removed {
        if cascade {
            sqlx::query("DELETE FROM category_regex WHERE cat_id = ?1")
                .bind(removed_id)
                .execute(&mut *tx)
                .await?;
        } else if let Some(heir) = heir {
            sqlx::query("UPDATE category_regex SET cat_id = ?1 WHERE cat_id = ?2")
                .bind(heir)
                .bind(removed_id)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query("DELETE FROM category WHERE id = ?1")
            .bind(removed_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        create_table(&pool).await.unwrap();
        crate::db::tables::cat_regex::create_table(&pool).await.unwrap();
        pool
    }

    fn new_category(name: &str, parent_id: Option<i32>) -> NewCategory {
        NewCategory {name: name.into(), priority: 1, color: None, regex_enabled: true, is_visible: true, in_stats: true, is_collapsed: false, parent_id}
    }

    async fn id_of(pool: &SqlitePool, name: &str) -> i32 {
        sqlx::query_scalar("SELECT id FROM category WHERE name = ?1 AND parent_id IS NULL").bind(name).fetch_one(pool).await.unwrap()
    }

    #[tokio::test]
    async fn legacy_tables_lose_the_global_unique_name_and_keep_their_rows() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE category (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, priority INTEGER, color TEXT, calendar_enabled INTEGER, regex_enabled INTEGER NOT NULL DEFAULT 1, is_visible INTEGER NOT NULL DEFAULT 1, in_stats INTEGER NOT NULL DEFAULT 1, is_collapsed INTEGER NOT NULL DEFAULT 1, parent_id INTEGER)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO category (id, name, priority, color, is_visible) VALUES (7, 'Coding', 400, '#123456', 0), (8, 'Work', 300, NULL, 1)").execute(&pool).await.unwrap();
        ensure_schema(&pool).await.unwrap();
        ensure_schema(&pool).await.unwrap();
        let row: (i32, i32, Option<String>, bool) = sqlx::query_as("SELECT id, priority, color, is_visible FROM category WHERE name = 'Coding'").fetch_one(&pool).await.unwrap();
        assert_eq!(row, (7, 400, Some("#123456".into()), false));
        assert!(insert_into(&pool, new_category("Email", Some(7))).await.is_ok());
        assert!(insert_into(&pool, new_category("Email", Some(8))).await.is_ok());
        assert!(insert_into(&pool, new_category("Email", Some(8))).await.is_err());
        assert!(insert_into(&pool, new_category("Coding", None)).await.is_err());
        assert!(insert_into(&pool, new_category("Email", None)).await.unwrap() > 8);
    }

    #[tokio::test]
    async fn subcategories_nest_one_level_and_inherit_the_parents_color() {
        let pool = test_pool().await;
        let coding = id_of(&pool, "Coding").await;
        let rust = insert_into(&pool, new_category("Rust", Some(coding))).await.unwrap();
        let color: Option<String> = sqlx::query_scalar("SELECT color FROM category WHERE id = ?1").bind(rust).fetch_one(&pool).await.unwrap();
        assert_eq!(color.as_deref(), Some("#1100ff"));
        assert!(insert_into(&pool, new_category("Too deep", Some(rust as i32))).await.is_err());
        assert!(insert_into(&pool, new_category("Orphan", Some(9999))).await.is_err());
        assert!(insert_into(&pool, new_category(FALLBACK_CATEGORY, Some(coding))).await.is_err());
    }

    #[tokio::test]
    async fn deleting_moves_rules_to_the_parent_or_miscellaneous() {
        let pool = test_pool().await;
        let coding = id_of(&pool, "Coding").await;
        let misc = id_of(&pool, FALLBACK_CATEGORY).await;
        let rust = insert_into(&pool, new_category("Rust", Some(coding))).await.unwrap() as i32;
        let python = insert_into(&pool, new_category("Python", Some(coding))).await.unwrap() as i32;
        let insert_rule = |cat_id: i32, regex: &'static str| {
            let pool = pool.clone();
            async move { sqlx::query("INSERT INTO category_regex (cat_id, regex) VALUES (?1, ?2)").bind(cat_id).bind(regex).execute(&pool).await.unwrap(); }
        };
        insert_rule(rust, "rs").await;
        insert_rule(python, "py").await;
        insert_rule(coding, "Code").await;

        delete_from(&pool, rust, false).await.unwrap();
        let owner: i32 = sqlx::query_scalar("SELECT cat_id FROM category_regex WHERE regex = 'rs'").fetch_one(&pool).await.unwrap();
        assert_eq!(owner, coding);

        delete_from(&pool, coding, false).await.unwrap();
        let owners: Vec<i32> = sqlx::query_scalar("SELECT DISTINCT cat_id FROM category_regex").fetch_all(&pool).await.unwrap();
        assert_eq!(owners, vec![misc]);
        let python_left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM category WHERE id = ?1").bind(python).fetch_one(&pool).await.unwrap();
        assert_eq!(python_left, 0);

        let social = id_of(&pool, "Social").await;
        let chat = insert_into(&pool, new_category("Chat", Some(social))).await.unwrap() as i32;
        insert_rule(chat, "Discord").await;
        delete_from(&pool, social, true).await.unwrap();
        let rules: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM category_regex WHERE regex = 'Discord'").fetch_one(&pool).await.unwrap();
        assert_eq!(rules, 0);
        assert!(delete_from(&pool, misc, true).await.is_err());
    }
}
