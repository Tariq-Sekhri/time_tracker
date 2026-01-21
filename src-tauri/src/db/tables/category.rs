use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteQueryResult;
use sqlx::{FromRow, Sqlite, SqlitePool};

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

    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM category")
        .fetch_one(pool)
        .await?;
    if count.0 == 0 {
        sqlx::query("INSERT OR IGNORE INTO category (name, priority, color) VALUES (?, ?, ?)")
            .bind("Miscellaneous")
            .bind(0)
            .bind::<Option<String>>(None)
            .execute(pool)
            .await?;
    }
    Ok(())
}
#[tauri::command]
pub async fn insert_category(new_category: NewCategory) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    Ok(
        sqlx::query("insert into category (name, priority, color) values (?,?,?)")
            .bind(new_category.name)
            .bind(new_category.priority)
            .bind(new_category.color)
            .execute(&pool)
            .await?
            .last_insert_rowid(),
    )
}
#[tauri::command]
pub async fn get_category_by_id(id: i32) -> Result<Category, Error> {
    let pool = db::get_pool().await?;
    let cat = sqlx::query_as::<_, Category>("select * from Category where id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await?;
    Ok(cat)
}

#[tauri::command]
pub async fn get_categories() -> Result<Vec<Category>, Error> {
    let pool = db::get_pool().await?;
    let cats = sqlx::query_as::<_, Category>("select * from Category ORDER BY priority DESC")
        .fetch_all(&pool)
        .await?;
    Ok(cats)
}
#[tauri::command]
pub async fn update_category_by_id(cat: Category) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("UPDATE category SET name = ?, priority = ?, color = ? WHERE id = ?")
        .bind(cat.name)
        .bind(cat.priority)
        .bind(cat.color)
        .bind(cat.id)
        .execute(&pool)
        .await?;
    Ok(())
}
#[tauri::command]
pub async fn delete_category_by_id(id: i32, cascade: bool) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    if cascade {
        // Delete all category_regex entries associated with this category
        sqlx::query("DELETE FROM category_regex WHERE cat_id = ?")
            .bind(id)
            .execute(&pool)
            .await?;
    }
    
    // Delete the category
    sqlx::query("DELETE FROM category WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await?;
    Ok(())
}
