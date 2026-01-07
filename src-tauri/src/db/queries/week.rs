use crate::db;
use crate::db::error::{AppError, WeekProcessError};
use crate::db::pool::get_pool;
use crate::db::tables::cat_regex::{get_cat_regex, CategoryRegex};
use crate::db::tables::category::{get_categories, Category};
use crate::db::tables::log::{get_logs, Log};

use regex::Regex;
use serde::Serialize;
use serde_json::to_string_pretty;
use sqlx;

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
        } else if self.category == "miscellaneous"  {
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
    let logs = get_logs().await?;
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
                if let Some(existing_app) = current.apps.iter_mut().find(|a| a.app == next_app.app) {
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
    let bucket_size = 15 * 60; // 15 minutes in seconds
    let max_gap = 5 * 60;
    
    if time_blocks.is_empty() {
        return Ok(time_blocks);
    }

    let mut result = time_blocks;
    result.sort_by_key(|b| b.start_time);
    
    // First pass: Create 15-minute buckets
    let mut first_pass_result = Vec::new();
    let mut remaining_blocks: Vec<TimeBlock> = result;
    let mut current_bucket: Option<TimeBlock> = None;
    let mut bucket_start: Option<i64> = None;
    let mut encountered_gap = false;
    
    while !remaining_blocks.is_empty() {
        let block = remaining_blocks.remove(0);
        
        // Initialize bucket if needed
        if current_bucket.is_none() {
            bucket_start = Some(block.start_time);
            current_bucket = Some(block);
            encountered_gap = false;
            continue;
        }
        
        let mut bucket = current_bucket.take().unwrap();
        let bucket_start_time = bucket_start.unwrap();
        let bucket_end_time = bucket_start_time + bucket_size;
        let bucket_duration = bucket.duration();
        
        // Check if we can add this block to the current bucket
        let block_fits_in_bucket = block.start_time < bucket_end_time;
        let bucket_not_full = bucket_duration < bucket_size;
        let can_add_to_bucket = block_fits_in_bucket && (bucket_not_full || encountered_gap);
        
        if can_add_to_bucket {
            // Check if block needs to be cut to fit in bucket
            if block.end_time > bucket_end_time {
                // Block extends beyond bucket, need to cut it
                let remaining_duration = block.end_time - bucket_end_time;
                let cut_duration = bucket_end_time - block.start_time;
                
                // Create a portion that fits in the bucket
                let mut bucket_portion = block.clone();
                bucket_portion.end_time = bucket_end_time;
                bucket_portion.start_time = bucket_portion.start_time.max(bucket.start_time);
                
                // Scale down app durations proportionally
                let scale_factor = cut_duration as f64 / block.duration() as f64;
                for app in &mut bucket_portion.apps {
                    app.total_duration = (app.total_duration as f64 * scale_factor) as i64;
                }
                
                bucket.merge_with(bucket_portion);
                
                // Create remainder block for next bucket
                if remaining_duration > 0 {
                    let mut remainder = block.clone();
                    remainder.start_time = bucket_end_time;
                    // Scale app durations for remainder
                    let remainder_scale = remaining_duration as f64 / block.duration() as f64;
                    for app in &mut remainder.apps {
                        app.total_duration = (app.total_duration as f64 * remainder_scale) as i64;
                    }
                    remaining_blocks.insert(0, remainder);
                }
            } else {
                // Block fits entirely, merge it
                bucket.merge_with(block);
            }
            
            // Check if bucket is now full
            if bucket.duration() >= bucket_size {
                first_pass_result.push(bucket);
                current_bucket = None;
                bucket_start = None;
            } else {
                current_bucket = Some(bucket);
            }
        } else {
            // Can't add to current bucket
            // Check if there's a gap
            if bucket.end_time < block.start_time {
                let gap = block.start_time - bucket.end_time;
                if gap <= max_gap {
                    encountered_gap = true;
                    // Try to add block to bucket despite gap
                    if bucket.duration() < bucket_size {
                        bucket.merge_with(block);
                        if bucket.duration() >= bucket_size {
                            first_pass_result.push(bucket);
                            current_bucket = None;
                            bucket_start = None;
                        } else {
                            current_bucket = Some(bucket);
                        }
                        continue;
                    }
                }
            }
            
            // Save current bucket and start new one
            if bucket.duration() > 0 {
                first_pass_result.push(bucket);
            }
            bucket_start = Some(block.start_time);
            current_bucket = Some(block);
            encountered_gap = false;
        }
    }
    
    // Add final bucket if exists
    if let Some(bucket) = current_bucket {
        first_pass_result.push(bucket);
    }
    
    result = first_pass_result;
    
    if result.is_empty() {
        return Ok(result);
    }

    // Second pass: Merge buckets with matching categories
    let mut second_pass_result = Vec::new();
    let mut current = result[0].clone();
    
    for next in result.into_iter().skip(1) {
        if current.category == next.category && current.is_consecutive_with(&next, max_gap) {
            current.merge_with(next);
        } else {
            second_pass_result.push(current);
            current = next;
        }
    }
    second_pass_result.push(current);

    Ok(ensure_non_overlapping(second_pass_result))
}
