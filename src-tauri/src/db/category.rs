use rusqlite::{Result, Connection, params, Statement};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Category{
    id:Option<i32>,
    name:String
}

impl Category{
    pub fn new(id:Option<i32>, name:String) -> Self {
        Category{
            id,
            name
        }
    }
}
pub fn create_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS category (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );",
        [],
    )?;
    Ok(())
}
pub fn insert(conn:&Connection, category: Category) ->Result<()>{
    conn.execute(
        "insert into category (name) VALUES (?)"
        ,params![category.name])?;
    Ok(())
}
pub fn delete_by_id(conn:&Connection,id:i32)->Result<()>{
    conn.execute("delete from category where id = ?",params![id])?;
    Ok(())
}
pub fn get_all(conn:&Connection) ->Result<Vec<Category>>{
    let mut statement:Statement = conn.prepare("select * from category")?;
    let cat_iter=
        (statement).query_map([],|row|{
                Ok(Category{
                    id:row.get(0)?,
                    name:row.get(1)?
                })
            })?;
    let categories :Vec<Category>= cat_iter.filter_map(|r| r.ok()).collect();
    Ok(categories)
}
