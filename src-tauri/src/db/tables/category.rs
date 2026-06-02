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
    pub calendar_enabled: bool,
    pub is_collapsed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategory {
    name: String,
    priority: i32,
    color: Option<String>,
    regex_enabled: bool,
    calendar_enabled: bool,
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
            calendar_enabled INTEGER NOT NULL DEFAULT 1,
            is_collapsed INTEGER NOT NULL DEFAULT 1
        );",
    )
    .execute(pool)
    .await?;

    let row = sqlx::query!("SELECT COUNT(*) as count FROM category")
        .fetch_one(pool)
        .await?;

    if row.count == 0 {
        let defaults: &[(&str, i32, Option<&str>, bool, bool, bool)] = &[
            ("Miscellaneous", 0, Some("#9c9c9c"), true, true, false),
            ("Hidden", 100, Some("#475569"), true, true, false),
            ("Browsing", 200, Some("#ff7300"), true, true, false),
            ("Music", 250, Some("#ec4899"), true, true, false),
            ("Reading", 300, Some("#a855f7"), true, true, false),
            ("Coding", 400, Some("#1100ff"), true, true, false),
            ("Gaming", 500, Some("#2eff89"), true, true, false),
            ("Watching", 600, Some("#fff700"), true, true, false),
            ("Social", 700, Some("#5662f6"), true, true, false),
        ];

        for (name, priority, color, regex_enabled, calendar_enabled, is_collapsed) in defaults {
            sqlx::query!(
                "INSERT OR IGNORE INTO category (
                    name,
                    priority,
                    color,
                    regex_enabled,
                    calendar_enabled,
                    is_collapsed
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                name,
                priority,
                color,
                regex_enabled,
                calendar_enabled,
                is_collapsed
            )
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn insert_category(new_category: NewCategory) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let result = sqlx::query!(
        "INSERT INTO category (
            name,
            priority,
            color,
            regex_enabled,
            calendar_enabled,
            is_collapsed
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        new_category.name,
        new_category.priority,
        new_category.color,
        new_category.regex_enabled,
        new_category.calendar_enabled,
        new_category.is_collapsed
    )
    .execute(&pool)
    .await?;

    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn get_category_by_id(id: i32) -> Result<Category, Error> {
    let pool = db::get_pool().await?;
    let cat = sqlx::query_as!(
        Category,
        r#"
        SELECT
            id as "id!: i32",
            name,
            priority as "priority!: i32",
            color,
            regex_enabled as "regex_enabled!: bool",
            calendar_enabled as "calendar_enabled!: bool",
            is_collapsed as "is_collapsed!: bool"
        FROM category
        WHERE id = ?1
        "#,
        id
    )
    .fetch_one(&pool)
    .await?;

    Ok(cat)
}

#[tauri::command]
pub async fn get_categories() -> Result<Vec<Category>, Error> {
    let pool = db::get_pool().await?;
    let cats = sqlx::query_as!(
        Category,
        r#"
        SELECT
            id as "id!: i32",
            name,
            priority as "priority!: i32",
            color,
            regex_enabled as "regex_enabled!: bool",
            calendar_enabled as "calendar_enabled!: bool",
            is_collapsed as "is_collapsed!: bool"
        FROM category
        ORDER BY priority DESC
        "#
    )
    .fetch_all(&pool)
    .await?;

    Ok(cats)
}

#[tauri::command]
pub async fn update_category_by_id(cat: Category) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let current = sqlx::query_as!(
        Category,
        r#"
        SELECT
            id as "id!: i32",
            name,
            priority as "priority!: i32",
            color,
            regex_enabled as "regex_enabled!: bool",
            calendar_enabled as "calendar_enabled!: bool",
            is_collapsed as "is_collapsed!: bool"
        FROM category
        WHERE id = ?1
        "#,
        cat.id
    )
    .fetch_optional(&pool)
    .await?;

    if let Some(ref c) = current {
        if c.name == "Miscellaneous" {
            sqlx::query(
                "UPDATE category
                 SET name = ?1,
                     priority = 0,
                     color = ?2,
                     regex_enabled = ?3,
                     calendar_enabled = ?4,
                     is_collapsed = ?5
                 WHERE id = ?6",
            )
            .bind(&cat.name)
            .bind(&cat.color)
            .bind(cat.regex_enabled)
            .bind(cat.calendar_enabled)
            .bind(cat.is_collapsed)
            .bind(cat.id)
            .execute(&pool)
            .await?;

            return Ok(());
        }
    }

    sqlx::query!(
        "UPDATE category
         SET name = ?1,
             priority = ?2,
             color = ?3,
             regex_enabled = ?4,
             calendar_enabled = ?5,
             is_collapsed = ?6
         WHERE id = ?7",
        cat.name,
        cat.priority,
        cat.color,
        cat.regex_enabled,
        cat.calendar_enabled,
        cat.is_collapsed,
        cat.id
    )
    .execute(&pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn delete_category_by_id(id: i32, cascade: bool) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let current = sqlx::query_as!(
        Category,
        r#"
        SELECT
            id as "id!: i32",
            name,
            priority as "priority!: i32",
            color,
            regex_enabled as "regex_enabled!: bool",
            calendar_enabled as "calendar_enabled!: bool",
            is_collapsed as "is_collapsed!: bool"
        FROM category
        WHERE id = ?1
        "#,
        id
    )
    .fetch_optional(&pool)
    .await?;

    if let Some(ref c) = current {
        if c.name == "Miscellaneous" {
            return Err(anyhow::anyhow!("The Miscellaneous category cannot be deleted.").into());
        }
    }

    if cascade {
        sqlx::query!("DELETE FROM category_regex WHERE cat_id = ?1", id)
            .execute(&pool)
            .await?;
    } else {
        let misc = sqlx::query!("SELECT id FROM category WHERE name = 'Miscellaneous'")
            .fetch_optional(&pool)
            .await?;

        if let Some(m) = misc {
            sqlx::query!(
                "UPDATE category_regex SET cat_id = ?1 WHERE cat_id = ?2",
                m.id,
                id
            )
            .execute(&pool)
            .await?;
        }
    }

    sqlx::query!("DELETE FROM category WHERE id = ?1", id)
        .execute(&pool)
        .await?;

    Ok(())
}
