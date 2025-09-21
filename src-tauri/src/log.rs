#[derive(Debug)]
pub struct Log {
    pub id: Option<i32>,
    pub app: String,
    pub timestamp: u128,
}

impl Log {
    pub fn new(id:Option<i32>, app: String, timestamp: u128) -> Self {
        Log {
            id,
            app,
            timestamp,
        }
    }
}