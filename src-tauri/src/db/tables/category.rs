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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategory {
    name: String,
    priority: i32,
    color: Option<String>,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            priority integer,
            color TEXT
        );",
    )
    .execute(pool)
    .await?;

    let row = sqlx::query!("SELECT COUNT(*) as count FROM category")
        .fetch_one(pool)
        .await?;
    if row.count == 0 {
        let defaults: &[(&str, i32, Option<&str>)] = &[
            ("Miscellaneous", 0, Some("#9c9c9c")),
            ("Browsing", 200, Some("#ff7300")),
            ("Music", 250, Some("#ec4899")),
            ("Reading", 300, Some("#a855f7")),
            ("Learning", 380, Some("#eab308")),
            ("Coding", 400, Some("#1100ff")),
            ("Gaming", 500, Some("#2eff89")),
            ("Watching", 600, Some("#fff700")),
            ("Social", 700, Some("#5662f6")),
        ];
        for (name, priority, color) in defaults {
            sqlx::query!(
                "INSERT OR IGNORE INTO category (name, priority, color) VALUES (?1, ?2, ?3)",
                name,
                priority,
                color
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
        "INSERT INTO category (name, priority, color) VALUES (?1, ?2, ?3)",
        new_category.name,
        new_category.priority,
        new_category.color
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
        r#"SELECT id as "id!: i32", name, COALESCE(priority, 0) as "priority!: i32", color FROM category WHERE id = ?1"#,
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
        r#"SELECT id as "id!: i32", name, COALESCE(priority, 0) as "priority!: i32", color FROM category ORDER BY priority DESC"#
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
        r#"SELECT id as "id!: i32", name, COALESCE(priority, 0) as "priority!: i32", color FROM category WHERE id = ?1"#,
        cat.id
    )
    .fetch_optional(&pool)
    .await?;
    if let Some(ref c) = current {
        if c.name == "Miscellaneous" {
            sqlx::query("UPDATE category SET name = ?1, priority = 0, color = ?2 WHERE id = ?3")
                .bind(&cat.name)
                .bind(&cat.color)
                .bind(cat.id)
                .execute(&pool)
                .await?;
            return Ok(());
        }
    }
    sqlx::query!(
        "UPDATE category SET name = ?1, priority = ?2, color = ?3 WHERE id = ?4",
        cat.name,
        cat.priority,
        cat.color,
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
        r#"SELECT id as "id!: i32", name, COALESCE(priority, 0) as "priority!: i32", color FROM category WHERE id = ?1"#,
        id
    )
    .fetch_optional(&pool)
    .await?;
    if let Some(ref c) = current {
        if c.name == "Miscellaneous" {
            return Err(Error::Other(
                "The Miscellaneous category cannot be deleted.".into(),
            ));
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
