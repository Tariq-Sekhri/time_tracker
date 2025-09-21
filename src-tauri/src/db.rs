use std::error::Error;
use std::fs;
use std::fs::File;
use std::path::{PathBuf, Path};
use rusqlite::{params, Connection, Result};

const PATH_FOLDER: &str = "../data";
const PATH: &str = "../data/app.db";

pub fn open() -> Result<Connection, Box<dyn std::error::Error>> {
    fs::create_dir_all(PATH_FOLDER)?;
    Ok(Connection::open(PATH)?)
}



pub fn create_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app (
            id INTEGER PRIMARY KEY,
            app TEXT,
            timestamp INTEGER
        )",
        [],
    )?;
    Ok(())
}

pub fn drop_all()->std::io::Result<()>{
    fs::remove_file(PATH)?;
    Ok(())
}


// pub fn idk(&conn:&Connection){
//     conn.execute("INSERT INTO t (name) VALUES (?)", params!["Alice"])?;
//     let mut stmt = conn.prepare("SELECT id, name FROM t")?;
//     let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
//     for row in rows {
//         let (id, name) = row?;
//         println!("{id}: {name}");
//     }
//     Ok(())
// }