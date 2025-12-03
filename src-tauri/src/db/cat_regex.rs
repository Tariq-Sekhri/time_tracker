use crate::db::category::NewCategory;
use serde::Serialize;
use sqlx::{Error, FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow)]
pub struct CategoryRegex {
    pub id: i32,
    pub cat_id: i32,
    pub regex: String,
}
#[derive(Debug, Serialize)]
pub struct NewCategoryRegex {
    cat_id: i32,
    regex: String,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), Error> {
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

pub async fn insert(pool: &SqlitePool, new_category_regex: NewCategoryRegex) -> Result<(), Error> {
    sqlx::query("INSERT INTO category_regex (cat_id, regex) values (?, ?, ?)")
        .bind(new_category_regex.cat_id)
        .bind(new_category_regex.regex)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_by_id(pool: &SqlitePool, cat_regex: CategoryRegex) -> Result<(), Error> {
    sqlx::query("update category_regex set cat_id= ?, regex=? where id = ?")
        .bind(cat_regex.cat_id)
        .bind(cat_regex.regex)
        .bind(cat_regex.id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_by_id(pool: &SqlitePool) -> Result<Option<CategoryRegex>, Error> {
    sqlx::query_as::<_, CategoryRegex>("")
        .fetch_optional(pool)
        .await
}

pub async fn get_cat_regex(pool: &SqlitePool) -> Result<Vec<CategoryRegex>, Error> {
    sqlx::query_as::<_, CategoryRegex>("select * from category_regex")
        .fetch_all(pool)
        .await
}

pub async fn delete_by_id(pool: &SqlitePool, id: i32) -> Result<(), Error> {
    sqlx::query("delete category category_regex where id=?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
