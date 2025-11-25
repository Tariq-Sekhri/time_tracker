use serde::Serialize;
use serde_json::to_string_pretty;
use sqlx::FromRow;
use sqlx::types::Json;
use crate::db;
use db::cat_regex::{get_cat_regex, CategoryRegex};
use db::category::{get_categories, Category};
use db::log::{get_logs, Log};

#[derive(Serialize)]
struct TimeBlock {
    id:i32,
    icon_path:String,
    category:String,
    color:String,
    logs: Vec<IdkLog>,
    start_time:i64,
    end_time:i64,
}

#[derive(Debug, Serialize, FromRow, Clone)]
 struct IdkLog {
    app: String,
    duration: i64,
}


#[tauri::command]
pub async fn get_week()->String{
    let mut index :i32= 0;
    match db::get_pool().await{
        Ok(pool) =>  {

           let logs =  get_logs(pool).await.unwrap();
            let cat_regex = get_cat_regex(pool).await.unwrap();
            let categories = get_categories(pool).await.unwrap();

            let week_start_time:i64 = 100;
            let week_end_time:i64 = 100;
            let mut idkLogs:Vec<IdkLog>;
            let logs_from_this_week:Vec<Log> = logs.into_iter().filter(|log| log.timestamp > week_start_time && log.timestamp< week_end_time ).collect();
            let asd = to_string_pretty(&logs_from_this_week).unwrap();
            println!("{}", asd);
            let min = 15;

            let resilutino =  min * 60;
            // for i in (week_start_time..week_end_time).step_by(resilutino) {
            //     logs_from_this_week.
            // }
            "hey".to_string()
        },
        Err(e) => {
            format!("Error: {e}")
        }
    }
}

#[tauri::command]
pub async fn get_cat_regex_cmd() -> String {
    match db::get_pool().await {
        Ok(pool) => match get_cat_regex(pool).await {
            Ok(cat_regex) => to_string_pretty(&cat_regex).unwrap().to_string(),
            Err(e) => {
                format!("Error: {e}")
            }
        },
        Err(e) => {
            format!("Error: {e}")
        }
    }
}

#[tauri::command]
pub async fn get_logs_cmd() -> String {
    match db::get_pool().await {
        Ok(pool) => match get_logs(&pool).await {
            Ok(logs) => to_string_pretty(&logs).unwrap().to_string(),
            Err(e) => {
                format!("Error: {e}")
            }
        },
        Err(e) => {
            format!("Error: {e}")
        }
    }
}

#[tauri::command]
pub async fn get_categories_cmd() -> String {
    match db::get_pool().await {
        Ok(pool) => match get_categories(&pool).await {
            Ok(categories) => to_string_pretty(&categories).unwrap().to_string(),
            Err(e) => {
                format!("Error: {e}")
            }
        },
        Err(e) => {
            format!("Error: {e}")
        }
    }
}

#[tauri::command]
pub async fn db_to_json() -> String{
    let pool = match db::get_pool().await {
        Ok(pool) => pool,
        Err(e) => return format!("Error connecting to database: {e}"),
    };
    let logs: Vec<Log> = match get_logs(&pool).await {
        Ok(logs) => logs,
        Err(e) => return format!("Error getting Logs table: {e}"),
    };

    let categories: Vec<Category> = match get_categories(&pool).await {
        Ok(category) => category,
        Err(e) => return format!("Error getting category table: {e}"),
    };

    let cat_regex: Vec<CategoryRegex> = match get_cat_regex(&pool).await {
        Ok(cat_regex) => cat_regex,
        Err(e) => return format!("Error getting Category Regex table: {e}"),
    };
    let mut json_db: String = String::from("{\n");

    match to_string_pretty(&logs) {
        Ok(s) => {
            json_db.push_str(&format!("\"logs\":{s},\n"));
        }
        Err(e) => {
            return format!("Error turn logs into json:{e}");
        }
    }
    match to_string_pretty(&categories) {
        Ok(cat) => json_db.push_str(&format!("\"Category\":{cat},\n")),
        Err(e) => return format!("error turning categories into json: {e}"),
    }
    match to_string_pretty(&cat_regex) {
        Ok(reg) => json_db.push_str(&format!("\"Category_Regex\":{reg}\n")),
        Err(e) => return format!("error turning category regex into json: {e}"),
    }

    json_db.push_str("\n}");

    json_db
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
