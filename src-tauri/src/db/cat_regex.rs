use rusqlite::{Connection,Result};

struct Category_Regex{
    id:Option<i32>,
    cat_id:i32,
    regex:String
}

impl Category_Regex{
    pub fn new(id:Option<i32>, cat_id:i32, regex:String){
        Category_Regex{
            id,
            cat_id,
            regex
        };
    }
}

pub fn create_table(conn:&Connection)->Result<()>{
    conn.execute("CREATE TABLE IF NOT EXISTS  category_regex (
                    id   INTEGER PRIMARY KEY AUTOINCREMENT,
                    cat_id INTEGER NOT NULL,
                    regex TEXT NOT NULL
                    );",[])?;
    Ok(())
}

// pub fn insert(category_regex: Category_Regex){
//     conn.ex
// }