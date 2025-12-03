use crate::db;
use db::cat_regex::{get_cat_regex, CategoryRegex};
use db::category::{get_categories, Category};
use db::log::{get_logs, serialize_timestamp, Log};
use regex::Regex;
use serde::Serialize;
use serde_json::to_string_pretty;
use sqlx::FromRow;

#[derive(Serialize, Clone, Debug)]
struct TimeBlockLogs {
    app: String,
    total_duration: i64,
}
#[derive(Serialize)]
struct TimeBlock {
    id: i32,
    category: String,
    apps: Vec<TimeBlockLogs>,
    #[serde(serialize_with = "serialize_timestamp")]
    start_time: i64,
    #[serde(serialize_with = "serialize_timestamp")]
    end_time: i64,
}

#[derive(Debug, Serialize, FromRow, Clone)]
struct HalfWayLogs {
    id: i64,
    app: String,

    #[serde(serialize_with = "serialize_timestamp")]
    start_timestamp: i64,
    #[serde(serialize_with = "serialize_timestamp")]
    end_timestamp: i64,
    duration: i64,
    category: String,
}
fn derive_category(app: &str, regexes: &Vec<RegexStuff>) -> String {
    regexes
        .iter()
        .find(|regex| regex.regex.is_match(app))
        .unwrap()
        .category
        .clone()
}

struct RegexStuff {
    regex: Regex,
    category: String,
    priority: i32,
}

#[tauri::command]
pub async fn get_week(week_start: i64, week_end: i64) -> String {
    match db::get_pool().await {
        Ok(pool) => {
            //todo merge these so ther run together
            let logs = get_logs(pool).await.unwrap();
            let cat_regex = get_cat_regex(pool).await.unwrap();
            let categories = get_categories(pool).await.unwrap();

            let mut regex: Vec<RegexStuff> = categories
                .iter()
                .map(|cat| RegexStuff {
                    category: cat.name.clone(),
                    priority: cat.priority,
                    regex: Regex::new(
                        cat_regex
                            .iter()
                            .find(|reg| reg.cat_id == cat.id)
                            .unwrap()
                            .regex
                            .as_str(),
                    )
                    .unwrap(),
                })
                .collect();
            regex.sort_by_key(|r| std::cmp::Reverse(r.priority));
            //todo make this a db function
            // let logs_from_this_week:Vec<Log> = logs.into_iter().filter(|log| log.timestamp > week_start && log.timestamp< week_end && log.duration==0 ).collect();
            let logs_from_this_week: Vec<Log> = logs;
            let half_way_logs: Vec<HalfWayLogs> = logs_from_this_week
                .iter()
                .map(|log| HalfWayLogs {
                    id: log.id,
                    app: log.app.clone(),
                    start_timestamp: log.timestamp,
                    end_timestamp: log.timestamp + log.duration,
                    duration: log.duration,
                    category: derive_category(&log.app, &regex),
                })
                .collect();

            let mut time_blocks: Vec<TimeBlock> = Vec::new();
            let first = half_way_logs.get(0).unwrap();
            time_blocks.push(TimeBlock {
                id: 0,
                category: first.category.clone(),
                start_time: first.start_timestamp,
                apps: vec![TimeBlockLogs {
                    app: first.app.clone(),
                    total_duration: first.duration,
                }],
                end_time: first.end_timestamp,
            });

            let mut timeblockindex = 0;
            for i in 1..half_way_logs.len() {
                let log = half_way_logs.get(i).unwrap();

                if let Some(current_time_block) = time_blocks.get_mut(timeblockindex) {
                    if current_time_block.category == log.category
                        || log.category == "Miscellaneous"
                    {
                        current_time_block.end_time = log.end_timestamp;
                        if let Some(matching_app) = current_time_block
                            .apps
                            .iter_mut()
                            .find(|s| s.app == log.app)
                        {
                            matching_app.total_duration += log.duration;
                        } else {
                            current_time_block.apps.push(TimeBlockLogs {
                                app: log.app.clone(),
                                total_duration: log.duration,
                            })
                        }
                    } else {
                        timeblockindex += 1;
                        time_blocks.push(TimeBlock {
                            id: timeblockindex as i32,
                            category: log.category.clone(),
                            start_time: log.start_timestamp,
                            apps: vec![TimeBlockLogs {
                                app: log.app.clone(),
                                total_duration: log.duration,
                            }],
                            end_time: log.end_timestamp,
                        });
                    }
                } else {
                    timeblockindex += 1;
                    time_blocks.push(TimeBlock {
                        id: timeblockindex as i32,
                        category: log.category.clone(),
                        start_time: log.start_timestamp,
                        apps: vec![TimeBlockLogs {
                            app: log.app.clone(),
                            total_duration: log.duration,
                        }],
                        end_time: log.end_timestamp,
                    });
                }
            }

            let asd = to_string_pretty(&time_blocks).unwrap();
            asd
        }
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
pub async fn db_to_json() -> String {
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
