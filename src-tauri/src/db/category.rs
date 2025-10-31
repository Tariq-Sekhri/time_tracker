use serde::Serialize;
use sqlx::{SqlitePool,Error};
#[derive(Debug, Serialize)]
pub struct Category{
    id:i32,
    name:String
}

#[derive(Debug, Serialize)]
pub struct NewCategory{
    name:String
}


pub async fn create_table(pool:&SqlitePool)-> Result<(),Error>{
    sqlx::query("CREATE TABLE IF NOT EXISTS category (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );").execute(pool).await?;
    Ok(())
}

