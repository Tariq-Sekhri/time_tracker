use crate::db;
use crate::db::category::NewCategory;
use crate::db::AppError as Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize)]
pub struct CategoryRegex {
    pub id: i32,
    pub cat_id: i32,
    pub regex: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategoryRegex {
    cat_id: i32,
    regex: String,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category_regex (
    id       INTEGER
        primary key autoincrement,
    cat_id   INTEGER not null,
    regex    TEXT    not null
);",
    )
    .execute(pool)
    .await?;
    Ok(())
}
#[tauri::command]

pub async fn insert_cat_regex(new_category_regex: NewCategoryRegex) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let new_id = sqlx::query("INSERT INTO category_regex (cat_id, regex) values (?, ?, ?)")
        .bind(new_category_regex.cat_id)
        .bind(new_category_regex.regex)
        .execute(pool)
        .await?
        .last_insert_rowid();
    Ok(new_id)
}
#[tauri::command]

pub async fn update_cat_regex_by_id(cat_regex: CategoryRegex) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("update category_regex set cat_id= ?, regex=? where id = ?")
        .bind(cat_regex.cat_id)
        .bind(cat_regex.regex)
        .bind(cat_regex.id)
        .execute(pool)
        .await?;
    Ok(())
}
#[tauri::command]

pub async fn get_cat_regex_by_id() -> Result<CategoryRegex, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as::<_, CategoryRegex>("")
        .fetch_one(pool)
        .await?;
    Ok(regex)
}
#[tauri::command]

pub async fn get_cat_regex() -> Result<Vec<CategoryRegex>, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as::<_, CategoryRegex>("select * from category_regex")
        .fetch_all(pool)
        .await?;
    Ok(regex)
}
#[tauri::command]
pub async fn delete_cat_regex_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("delete category category_regex where id=?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
