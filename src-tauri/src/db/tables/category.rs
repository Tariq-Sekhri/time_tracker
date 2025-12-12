use crate::db;
use crate::db::AppError as Error;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteQueryResult;
use sqlx::{FromRow, Sqlite, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize)]
pub struct Category {
    pub id: i32,
    pub name: String,
    pub priority: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategory {
    name: String,
    priority: i32,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            priority integer

        );",
    )
    .execute(pool)
    .await?;
    Ok(())
}
#[tauri::command]
pub async fn insert_category(new_category: NewCategory) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    Ok(
        sqlx::query("insert into category (name, priority) values (?,?)")
            .bind(new_category.name)
            .bind(new_category.priority)
            .execute(pool)
            .await?
            .last_insert_rowid(),
    )
}
#[tauri::command]

pub async fn get_category_by_id(id: i32) -> Result<Category, Error> {
    let pool = db::get_pool().await?;
    let cat = sqlx::query_as::<_, Category>("select * from Category where id = ?")
        .bind(id)
        .fetch_one(pool)
        .await?;
    Ok(cat)
}

#[tauri::command]
pub async fn get_categories() -> Result<Vec<Category>, Error> {
    let pool = db::get_pool().await?;
    let cats = sqlx::query_as::<_, Category>("select * from Category")
        .fetch_all(pool)
        .await?;
    Ok(cats)
}
#[tauri::command]

pub async fn update_category_by_id(cat: Category) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("update category where id= ? set name = ?, priority = ?")
        .bind(cat.id)
        .bind(cat.name)
        .bind(cat.priority)
        .execute(pool)
        .await?;
    Ok(())
}
#[tauri::command]

pub async fn delete_category_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("delete from category where id= ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
