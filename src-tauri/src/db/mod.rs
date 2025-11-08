#![cfg_attr(not(feature = "dev-warnings"), allow(dead_code, unused_imports))]


use std::fs;
use std::sync::OnceLock;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

pub mod log;
pub mod category;
pub mod cat_regex;

const PATH_FOLDER: &str = "../data";
const PATH: &str = "../data/app.db";
static POOL:OnceLock<SqlitePool> = OnceLock::new();
pub fn drop_all() -> std::io::Result<()> {
    fs::remove_file(PATH)?;
    Ok(())
}
pub async fn get_pool()->Result<&'static SqlitePool, sqlx::Error>{
    if let Some(pool) = POOL.get()  {
        Ok(pool)
    }else{
        let pool = create_pool().await?;
        let _ = POOL.set(pool).ok();
        Ok(POOL.get().unwrap())
    }
}

 async fn create_pool() -> Result<SqlitePool, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(&format!("sqlite://{}", PATH))
        .await?;
    create_all_tables(&pool).await?;
    Ok(pool)
}

async fn create_all_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    log::create_table(pool).await?;
    category::create_table(pool).await?;
    cat_regex::create_table(pool).await?;
    Ok(())
}
