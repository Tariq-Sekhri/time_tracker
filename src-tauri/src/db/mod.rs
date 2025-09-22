use std::fs;
use rusqlite::Connection;

pub mod log;
pub mod category;

const PATH_FOLDER: &str = "../data";
const PATH: &str = "../data/app.log_model";
pub fn drop_all()->std::io::Result<()>{
    fs::remove_file(PATH)?;
    Ok(())
}

pub fn open() -> rusqlite::Result<Connection, Box<dyn std::error::Error>> {
    fs::create_dir_all(PATH_FOLDER)?;
    Ok(Connection::open(PATH)?)
}
pub fn create_tables(conn:&Connection)->rusqlite::Result<()>{
    log::create_table(&conn)?;
    category::create_table(&conn)?;
    
    Ok(())
}