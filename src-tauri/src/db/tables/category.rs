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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategory {
    name: String,
    priority: i32,
    color: Option<String>,
    regex_enabled: bool,
    is_visible: bool,
    in_stats: bool,
    is_collapsed: bool,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            priority INTEGER,
            color TEXT,
            regex_enabled INTEGER NOT NULL DEFAULT 1,
            is_visible INTEGER NOT NULL DEFAULT 1,
            in_stats INTEGER NOT NULL DEFAULT 1,
            is_collapsed INTEGER NOT NULL DEFAULT 1
        );",
    )
    .execute(pool)
    .await?;

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

#[tauri::command]
pub async fn insert_category(new_category: NewCategory) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let result = sqlx::query(
        "INSERT INTO category (
            name,
            priority,
            color,
            regex_enabled,
            is_visible,
            in_stats,
            is_collapsed
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(&new_category.name)
    .bind(new_category.priority)
    .bind(&new_category.color)
    .bind(new_category.regex_enabled)
    .bind(new_category.is_visible)
    .bind(new_category.in_stats)
    .bind(new_category.is_collapsed)
    .execute(&pool)
    .await?;

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
            is_collapsed
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
            is_collapsed
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
        if c.name == "Miscellaneous" {
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
            .await?;

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
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn delete_category_by_id(id: i32, cascade: bool) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let current = get_category_by_id(id).await.ok();

    if let Some(ref c) = current {
        if c.name == "Miscellaneous" {
            return Err(anyhow::anyhow!("The Miscellaneous category cannot be deleted.").into());
        }
    }

    if cascade {
        sqlx::query("DELETE FROM category_regex WHERE cat_id = ?1")
            .bind(id)
            .execute(&pool)
            .await?;
    } else {
        let misc_id: Option<i32> =
            sqlx::query_scalar("SELECT id FROM category WHERE name = 'Miscellaneous'")
                .fetch_optional(&pool)
                .await?;

        if let Some(misc_id) = misc_id {
            sqlx::query("UPDATE category_regex SET cat_id = ?1 WHERE cat_id = ?2")
                .bind(misc_id)
                .bind(id)
                .execute(&pool)
                .await?;
        }
    }

    sqlx::query("DELETE FROM category WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await?;

    Ok(())
}
