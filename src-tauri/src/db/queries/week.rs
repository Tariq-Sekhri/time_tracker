use crate::db;
use crate::db::error::{AppError, WeekProcessError};
use crate::db::pool::get_pool;
use crate::db::tables::cat_regex::{get_cat_regex, CategoryRegex};
use crate::db::tables::category::{get_categories, Category};
use crate::db::tables::log::{delete_log_by_id, get_logs, Log};
use crate::db::tables::skipped_app::get_skipped_apps;

use regex::Regex;
use serde::Serialize;
use serde_json::to_string_pretty;
use sqlx;
use std::collections::HashMap;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TimeBlockLogs {
    pub app: String,
    pub total_duration: i64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TimeBlock {
    pub id: i32,
    pub category: String,
    pub apps: Vec<TimeBlockLogs>,
    pub start_time: i64,
    pub end_time: i64,
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

    fn duration(&self) -> i64 {
        self.end_time - self.start_time
    }

    fn is_consecutive_with(&self, other: &TimeBlock, max_gap: i64) -> bool {
        let gap = if self.end_time <= other.start_time {
            other.start_time - self.end_time
        } else {
            self.start_time - other.end_time
        };
        gap <= max_gap
    }

    fn merge_with(&mut self, other: TimeBlock) {
        let new_start = self.start_time.min(other.start_time);
        let new_end = self.end_time.max(other.end_time);

        self.start_time = new_start;
        self.end_time = new_end;

        let combined_category = if self.category == other.category {
            self.category.clone()
        } else if self.category == "miscellaneous" {
            other.category.clone()
        } else if self.category == "miscellaneous" {
            self.category.clone()
        } else if self.category.contains(&other.category) {
            self.category.clone()
        } else if other.category.contains(&self.category) {
            other.category.clone()
        } else {
            self.category.clone()
        };
        self.category = combined_category;

        for other_app in other.apps {
            if let Some(existing_app) = self.apps.iter_mut().find(|a| a.app == other_app.app) {
                existing_app.total_duration += other_app.total_duration;
            } else {
                self.apps.push(other_app);
            }
        }
    }
}

struct CachedCategoryRegex {
    regex: Regex,
    category: String,
    priority: i32,
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
    // Build a map of category ID to category for quick lookup
    let category_map: HashMap<i32, &Category> = categories
        .iter()
        .map(|cat| (cat.id, cat))
        .collect();

    // Create a CachedCategoryRegex for each regex pattern (not just one per category)
    let mut regex: Vec<CachedCategoryRegex> = cat_regex
        .iter()
        .map(|reg| {
            let cat = category_map
                .get(&reg.cat_id)
                .ok_or(WeekProcessError::MissingCategory)?;

            let compiled_regex = Regex::new(&reg.regex)?;

            Ok(CachedCategoryRegex {
                category: cat.name.clone(),
                priority: cat.priority,
                regex: compiled_regex,
            })
        })
        .collect::<Result<Vec<_>, WeekProcessError>>()?;

    // Sort by priority (highest first) so highest priority matches are checked first
    regex.sort_by_key(|r| std::cmp::Reverse(r.priority));
    Ok(regex)
}

fn get_time_blocks(
    logs: &[Log],
    regex: &[CachedCategoryRegex],
) -> Result<Vec<TimeBlock>, WeekProcessError> {
    let mut time_blocks: Vec<TimeBlock> = Vec::new();
    let first = logs.get(0).ok_or(WeekProcessError::NoLogs)?;
    time_blocks.push(TimeBlock::new(
        first,
        0,
        derive_category(&first.app, regex)?,
    ));

    let mut time_block_index = 0;
    for log in &logs[1..] {
        let log_cat = derive_category(&log.app, regex)?;
        let log_end_time = log.timestamp + log.duration;

        if let Some(current_time_block) = time_blocks.get_mut(time_block_index) {
            if current_time_block.category == log_cat || log_cat == "Miscellaneous" {
                if log.timestamp <= current_time_block.end_time {
                    current_time_block.end_time = current_time_block.end_time.max(log_end_time);
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
            } else {
                time_block_index += 1;
                time_blocks.push(TimeBlock::new(log, time_block_index as i32, log_cat));
            }
        }
    }

    Ok(time_blocks)
}

#[tauri::command]
pub async fn get_week(week_start: i64, week_end: i64) -> Result<Vec<TimeBlock>, AppError> {
    let mut logs = get_logs().await?;
    let skipped_apps = get_skipped_apps().await?;
    let skipped_app_names: std::collections::HashSet<String> = skipped_apps
        .iter()
        .map(|app| app.app_name.clone())
        .collect();
    
    // Filter out and delete logs for skipped apps
    let logs_to_delete: Vec<i64> = logs
        .iter()
        .filter(|log| skipped_app_names.contains(&log.app))
        .map(|log| log.id)
        .collect();
    
    // Delete the logs
    for log_id in logs_to_delete {
        let _ = delete_log_by_id(log_id).await;
    }
    
    // Filter out skipped apps from the logs list
    logs.retain(|log| !skipped_app_names.contains(&log.app));
    
    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    let regex = build_regex_table(&categories, &cat_regex)?;

    let logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| log.timestamp > week_start && log.timestamp < week_end)
        .collect();

    transform_time_blocks(get_time_blocks(&logs, &regex)?)
}

fn ensure_non_overlapping(mut blocks: Vec<TimeBlock>) -> Vec<TimeBlock> {
    if blocks.is_empty() {
        return blocks;
    }

    blocks.sort_by_key(|b| b.start_time);

    let mut result = Vec::new();
    let mut current = blocks[0].clone();

    for next in blocks.into_iter().skip(1) {
        if next.start_time <= current.end_time {
            current.end_time = current.end_time.max(next.end_time);

            let combined_category = if current.category == next.category {
                current.category.clone()
            } else if current.category == "miscellaneous" || current.category == "Miscellaneous" {
                next.category.clone()
            } else if next.category == "miscellaneous" || next.category == "Miscellaneous" {
                current.category.clone()
            } else if current.category.contains(&next.category) {
                current.category.clone()
            } else if next.category.contains(&current.category) {
                next.category.clone()
            } else {
                current.category.clone()
            };
            current.category = combined_category;

            for next_app in next.apps {
                if let Some(existing_app) = current.apps.iter_mut().find(|a| a.app == next_app.app)
                {
                    existing_app.total_duration += next_app.total_duration;
                } else {
                    current.apps.push(next_app);
                }
            }
        } else {
            result.push(current);
            current = next;
        }
    }
    result.push(current);

    result
}

fn transform_time_blocks(time_blocks: Vec<TimeBlock>) -> Result<Vec<TimeBlock>, AppError> {
    let lookahead_window = 10 * 60; // 10 minutes in seconds - how far ahead to look for same category
    let min_duration = 60; // 1 minute in seconds - minimum duration for a time block

    // Pre-filter: only keep blocks longer than 1 minute
    let mut result: Vec<TimeBlock> = time_blocks
        .into_iter()
        .filter(|block| {
            let duration = block.end_time - block.start_time;
            duration >= min_duration
        })
        .collect();

    if result.is_empty() {
        return Ok(result);
    }

    result.sort_by_key(|b| b.start_time);
    let mut to_remove = std::collections::HashSet::new();

    // Extend blocks forward if same category appears soon
    for i in 0..result.len() {
        if to_remove.contains(&i) {
            continue;
        }

        let current_category = result[i].category.clone();

        // Look ahead for blocks with the same category to merge
        // Keep checking all remaining blocks since merging extends the current block
        for j in (i + 1)..result.len() {
            if to_remove.contains(&j) {
                continue;
            }

            let future_category = result[j].category.clone();
            let future_start = result[j].start_time;
            let future_end = result[j].end_time;
            let future_apps = result[j].apps.clone();

            // If future block has same category, merge if overlapping or within lookahead window
            if future_category == current_category {
                // Get current end time (it may have been extended by previous merges)
                let current_end = result[i].end_time;
                let gap = future_start - current_end;

                // Merge if overlapping (gap < 0) or within lookahead window
                if gap <= lookahead_window {
                    // Extend current block to include this future block
                    result[i].end_time = future_end.max(current_end);

                    // Also update start time if future block starts earlier (overlap case)
                    if future_start < result[i].start_time {
                        result[i].start_time = future_start;
                    }

                    // Merge apps from future block into current block
                    for future_app in future_apps {
                        if let Some(existing_app) =
                            result[i].apps.iter_mut().find(|a| a.app == future_app.app)
                        {
                            existing_app.total_duration += future_app.total_duration;
                        } else {
                            result[i].apps.push(future_app);
                        }
                    }

                    // Mark future block for removal
                    to_remove.insert(j);
                }
            }
        }
    }

    // Remove merged blocks (iterate backwards to maintain indices)
    let mut indices_to_remove: Vec<usize> = to_remove.into_iter().collect();
    indices_to_remove.sort_unstable();
    indices_to_remove.reverse();

    for idx in indices_to_remove {
        result.remove(idx);
    }

    Ok(result)
}
