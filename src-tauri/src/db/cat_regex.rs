use rusqlite::{params, Connection, Result};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CategoryRegex {
    id: Option<i32>,
    cat_id: i32,
    regex: String,
    priority:i32,
}

impl CategoryRegex {
    pub fn new(id: Option<i32>, cat_id: i32, regex: String, priority:i32) -> Self {
        Self { id, cat_id, regex,priority }
    }
}

pub fn create_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS category_regex (
    id       INTEGER
        primary key autoincrement,
    cat_id   INTEGER not null,
    regex    TEXT    not null,
    priority integer
);",
        [],
    )?;
    Ok(())
}

pub fn insert(conn: &Connection, category_regex: &CategoryRegex) -> Result<()> {
    conn.execute(
        "INSERT INTO category_regex (cat_id, regex, priority) VALUES (?, ?, ?)",
        params![category_regex.cat_id, category_regex.regex, category_regex.priority],
    )?;
    Ok(())
}

pub fn delete_by_id(conn: &Connection, id: i32) -> Result<()> {
    conn.execute(
        "DELETE FROM category_regex WHERE id = ?",
        params![id],
    )?;
    Ok(())
}

pub fn get_all(conn: &Connection) -> Result<Vec<CategoryRegex>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM category_regex",
    )?;
    let iter = stmt.query_map([], |row| {
        Ok(CategoryRegex {
            id: row.get(0)?,
            cat_id: row.get(1)?,
            regex: row.get(2)?,
            priority:row.get(3)?,
        })
    })?;

    // Propagate row mapping errors instead of silently dropping them
    iter.collect()
}

pub fn get_by_id(conn: &Connection, id: i32) -> Result<CategoryRegex> {
    let mut stmt = conn.prepare(
        "SELECT * FROM category_regex WHERE id = ?",
    )?;
    stmt.query_row(params![id], |r| {
        Ok(CategoryRegex {
            id: r.get(0)?,
            cat_id: r.get(1)?,
            regex: r.get(2)?,
            priority: r.get(3)?
        })
    })
}