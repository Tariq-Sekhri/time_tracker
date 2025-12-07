use crate::db;
use crate::db::AppError;
use serde::Serialize;
use sqlx::sqlite::SqliteQueryResult;
use sqlx::{Error, FromRow, Sqlite, SqlitePool};

#[derive(Debug, Serialize, FromRow)]
pub struct Category {
    pub id: i32,
    pub name: String,
    pub priority: i32,
}

#[derive(Debug, Serialize)]
pub struct NewCategory {
    name: String,
    priority: i32,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), Error> {
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
pub async fn insert(new_category: NewCategory) -> Result<i64, Error> {
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

pub async fn get_by_id(id: i32) -> Result<Category, Error> {
    let pool = db::get_pool().await?;
    sqlx::query_as::<_, Category>("select * from Category where id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
}

#[tauri::command]
pub async fn get_categories() -> Result<Vec<Category>, AppError> {
    // return Err(AppError::Db("synthetic test error".into()));
    let pool = db::get_pool().await?;
    let cats = sqlx::query_as::<_, Category>("select * from Category")
        .fetch_all(pool)
        .await?;
    Ok(cats)
}

pub async fn update_by_id(cat: Category) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("update category where id= ? set name = ?, priority = ?")
        .bind(cat.id)
        .bind(cat.name)
        .bind(cat.priority)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("delete from category where id= ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
