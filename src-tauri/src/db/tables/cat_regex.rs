use crate::db;
use crate::db::Error;
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

    // Insert default ".*" regex for Miscellaneous category if table is empty
    let row = sqlx::query!("SELECT COUNT(*) as count FROM category_regex")
        .fetch_one(pool)
        .await?;

    if row.count == 0 {
        let misc = sqlx::query!("SELECT id FROM category WHERE name = 'Miscellaneous'")
            .fetch_optional(pool)
            .await?;
        if let Some(m) = misc {
            sqlx::query!(
                "INSERT OR IGNORE INTO category_regex (cat_id, regex) VALUES (?1, ?2)",
                m.id,
                ".*"
            )
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn insert_cat_regex(new_category_regex: NewCategoryRegex) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let result = sqlx::query!(
        "INSERT INTO category_regex (cat_id, regex) VALUES (?1, ?2)",
        new_category_regex.cat_id,
        new_category_regex.regex
    )
    .execute(&pool)
    .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_cat_regex_by_id(cat_regex: CategoryRegex) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    // Prevent editing the catch-all (Miscellaneous .* regex) - could cause app crashes
    let current = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex WHERE id = ?1"#,
        cat_regex.id
    )
    .fetch_optional(&pool)
    .await?;
    if let Some(ref row) = current {
        let cat_name: Option<String> = sqlx::query_scalar("SELECT name FROM category WHERE id = ?1")
            .bind(row.cat_id)
            .fetch_optional(&pool)
            .await?;
        if cat_name.as_deref() == Some("Miscellaneous") && row.regex == ".*" {
            return Err(Error::Other(
                "The catch-all pattern (.*) for Miscellaneous cannot be edited.".into(),
            ));
        }
    }
    
    // Validate that the category exists
    let category_exists: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM category WHERE id = ?1",
        cat_regex.cat_id
    )
    .fetch_one(&pool)
    .await?;
    
    if category_exists == 0 {
        return Err(Error::Other(format!(
            "Category with id {} does not exist",
            cat_regex.cat_id
        )));
    }
    
    // Validate that the regex entry exists
    let regex_exists: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM category_regex WHERE id = ?1",
        cat_regex.id
    )
    .fetch_one(&pool)
    .await?;
    
    if regex_exists == 0 {
        return Err(Error::Other(format!(
            "Regex pattern with id {} does not exist",
            cat_regex.id
        )));
    }
    
    sqlx::query!(
        "UPDATE category_regex SET cat_id = ?1, regex = ?2 WHERE id = ?3",
        cat_regex.cat_id,
        cat_regex.regex,
        cat_regex.id
    )
    .execute(&pool)
    .await?;
    Ok(())
}
#[tauri::command]
pub async fn get_cat_regex_by_id(id: i32) -> Result<CategoryRegex, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex WHERE id = ?1"#,
        id
    )
    .fetch_one(&pool)
    .await?;
    Ok(regex)
}
#[tauri::command]
pub async fn get_cat_regex() -> Result<Vec<CategoryRegex>, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex"#
    )
    .fetch_all(&pool)
    .await?;
    Ok(regex)
}
#[tauri::command]
pub async fn delete_cat_regex_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let row = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex WHERE id = ?1"#,
        id
    )
    .fetch_optional(&pool)
    .await?;
    if let Some(ref r) = row {
        let cat_name: Option<String> = sqlx::query_scalar("SELECT name FROM category WHERE id = ?1")
            .bind(r.cat_id)
            .fetch_optional(&pool)
            .await?;
        if cat_name.as_deref() == Some("Miscellaneous") && r.regex == ".*" {
            return Err(Error::Other(
                "The catch-all pattern (.*) for Miscellaneous cannot be deleted.".into(),
            ));
        }
    }
    sqlx::query!("DELETE FROM category_regex WHERE id = ?1", id)
        .execute(&pool)
        .await?;
    Ok(())
}
