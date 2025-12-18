use crate::db;
use crate::db::error::AppError;
use crate::db::pool::get_pool;
use crate::db::tables::cat_regex::{get_cat_regex, CategoryRegex};
use crate::db::tables::category::{get_categories, Category};
use crate::db::tables::log::{get_logs, serialize_timestamp, Log};
use std::fmt::Formatter;

use regex::Regex;
use serde::Serialize;
use serde_json::to_string_pretty;
use sqlx;

#[derive(Serialize, Clone, Debug)]
pub struct TimeBlockLogs {
    app: String,
    total_duration: i64,
}

#[derive(Serialize)]
pub struct TimeBlock {
    id: i32,
    category: String,
    apps: Vec<TimeBlockLogs>,
    #[serde(serialize_with = "serialize_timestamp")]
    start_time: i64,
    #[serde(serialize_with = "serialize_timestamp")]
    end_time: i64,
}

impl TimeBlock {
    fn new(log: &Log, id: i32, log_cat: String) -> Self {
        TimeBlock {
            id,
            category: log_cat,
            start_time: log.timestamp,
            apps: vec![TimeBlockLogs {
                app: log.app.clone(),
                total_duration: log.duration,
            }],
            end_time: log.timestamp + log.duration,
        }
    }
}

struct CachedCategoryRegex {
    regex: Regex,
    category: String,
    priority: i32,
}

#[derive(Debug)]
enum DatabaseError {
    Sqlx(sqlx::Error),
    AppError(AppError),
}

#[derive(Debug)]
enum WeekProcessError {
    Database(DatabaseError),
    Regex(regex::Error),
    MissingCategory,
    NoLogs,
    Serialization(serde_json::Error),
}

impl std::fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            DatabaseError::Sqlx(e) => write!(f, "Database error: {}", e),
            DatabaseError::AppError(e) => write!(f, "Database error: {}", e),
        }
    }
}

impl std::fmt::Display for WeekProcessError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            WeekProcessError::Database(e) => write!(f, "Database error: {}", e),
            WeekProcessError::Regex(e) => write!(f, "Regex error: {}", e),
            WeekProcessError::MissingCategory => write!(f, "Missing category"),
            WeekProcessError::NoLogs => write!(f, "No logs found"),
            WeekProcessError::Serialization(e) => write!(f, "Serialization error: {}", e),
        }
    }
}

impl From<sqlx::Error> for WeekProcessError {
    fn from(err: sqlx::Error) -> Self {
        WeekProcessError::Database(DatabaseError::Sqlx(err))
    }
}

impl From<AppError> for WeekProcessError {
    fn from(err: AppError) -> Self {
        WeekProcessError::Database(DatabaseError::AppError(err))
    }
}

impl From<regex::Error> for WeekProcessError {
    fn from(err: regex::Error) -> Self {
        WeekProcessError::Regex(err)
    }
}

impl From<serde_json::Error> for WeekProcessError {
    fn from(err: serde_json::Error) -> Self {
        WeekProcessError::Serialization(err)
    }
}

impl From<WeekProcessError> for String {
    fn from(err: WeekProcessError) -> Self {
        err.to_string()
    }
}

impl From<WeekProcessError> for AppError {
    fn from(err: WeekProcessError) -> Self {
        AppError::Other(err.to_string())
    }
}

fn derive_category(app: &str, regexes: &[CachedCategoryRegex]) -> Result<String, WeekProcessError> {
    regexes
        .iter()
        .find(|regex| regex.regex.is_match(app))
        .map(|regex| regex.category.clone())
        .ok_or(WeekProcessError::MissingCategory)
}

fn build_regex_table(
    categories: &[Category],
    cat_regex: &[CategoryRegex],
) -> Result<Vec<CachedCategoryRegex>, WeekProcessError> {
    let mut regex: Vec<CachedCategoryRegex> = categories
        .iter()
        .map(|cat| {
            let reg = cat_regex
                .iter()
                .find(|reg| reg.cat_id == cat.id)
                .ok_or(WeekProcessError::MissingCategory)?;

            let regex = Regex::new(&reg.regex)?;

            Ok(CachedCategoryRegex {
                category: cat.name.clone(),
                priority: cat.priority,
                regex,
            })
        })
        .collect::<Result<Vec<_>, WeekProcessError>>()?;

    regex.sort_by_key(|r| std::cmp::Reverse(r.priority));
    Ok(regex)
}

#[tauri::command]
pub async fn get_week(week_start: i64, week_end: i64) -> Result<Vec<TimeBlock>, AppError> {
    let _pool = get_pool().await?;
    let logs = get_logs().await?;
    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    let regex = build_regex_table(&categories, &cat_regex)?;

    let logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| log.timestamp > week_start && log.timestamp < week_end)
        .collect();

    let mut time_blocks: Vec<TimeBlock> = Vec::new();
    let first = logs.get(0).ok_or(WeekProcessError::NoLogs)?;
    time_blocks.push(TimeBlock::new(
        first,
        0,
        derive_category(&first.app, &regex)?,
    ));

    let mut time_block_index = 0;
    for log in &logs[1..] {
        let log_cat = derive_category(&log.app, &regex)?;

        if let Some(current_time_block) = time_blocks.get_mut(time_block_index) {
            if current_time_block.category == log_cat || log_cat == "Miscellaneous" {
                current_time_block.end_time += log.duration;
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
                time_block_index += 1;
                time_blocks.push(TimeBlock::new(log, time_block_index as i32, log_cat));
            }
        }
    }

    Ok(time_blocks)
}
