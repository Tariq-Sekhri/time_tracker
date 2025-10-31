use serde::Serialize;
use sqlx::{Error, SqlitePool};

#[derive(Debug, Serialize)]
pub struct CategoryRegex {
    id: i32,
    cat_id: i32,
    regex: String,
    priority:i32,
}
#[derive(Debug, Serialize)]
pub struct NewCategoryRegex {
    cat_id: i32,
    regex: String,
    priority:i32,
}

pub async fn create_table(pool:&SqlitePool)->Result<(),Error>{
    sqlx::query("CREATE TABLE IF NOT EXISTS category_regex (
    id       INTEGER
        primary key autoincrement,
    cat_id   INTEGER not null,
    regex    TEXT    not null,
    priority integer
);").execute(pool).await?;
    Ok(())
}