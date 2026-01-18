use crate::db;
use cat_regex::{get_cat_regex, CategoryRegex};
use category::{get_categories, Category};
use chrono::{Datelike, Timelike};
use db::error::Error;
use db::tables::{cat_regex, category, log, skipped_app};
use log::{get_logs, Log};
use regex::Regex;
use serde::Serialize;
use skipped_app::get_skipped_apps;
use std::collections::HashMap;

#[derive(Serialize, Debug, Clone)]
pub struct CategoryStat {
    pub category: String,
    pub total_duration: i64,
    pub percentage: f64,
    pub percentage_change: Option<f64>,
    pub color: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct AppStat {
    pub app: String,
    pub total_duration: i64,
    pub percentage_change: Option<f64>,
}

#[derive(Serialize, Debug, Clone)]
pub struct HourlyStat {
    pub hour: i32, // 0-23
    pub total_duration: i64,
}

#[derive(Serialize, Debug, Clone)]
pub struct DayCategoryStat {
    pub day: i32, // 0=Monday, 6=Sunday
    pub category: String,
    pub total_duration: i64,
}

#[derive(Serialize, Debug, Clone)]
pub struct WeekStatistics {
    pub total_time: i64,
    pub total_time_change: Option<f64>, // Percentage change vs previous week
    pub categories: Vec<CategoryStat>,
    pub top_apps: Vec<AppStat>,
    pub all_apps: Vec<AppStat>, // All apps for apps list screen
    pub hourly_distribution: Vec<HourlyStat>,
    pub day_category_breakdown: Vec<DayCategoryStat>,
    pub first_active_day: Option<i64>, // Unix timestamp
    pub number_of_active_days: i32,
    pub total_number_of_days: i32,
    pub all_time_today: i64,
    pub total_time_all_time: i64,
    pub average_time_active_days: f64,
    pub most_active_day: Option<(i64, i64)>, // (timestamp, duration)
    pub most_inactive_day: Option<(i64, i64)>, // (timestamp, duration)
}

#[derive(Serialize, Debug, Clone)]
pub struct DayStatistics {
    pub total_time: i64,
    pub categories: Vec<CategoryStat>,
    pub top_apps: Vec<AppStat>,
    pub hourly_distribution: Vec<HourlyStat>,
}

struct CachedCategoryRegex {
    regex: Regex,
    category: String,
    priority: i32,
}

fn derive_category(app: &str, regexes: &[CachedCategoryRegex]) -> String {
    if regexes.is_empty() {
        return "Miscellaneous".to_string();
    }

    regexes
        .iter()
        .find(|regex| regex.regex.is_match(app))
        .map(|regex| regex.category.clone())
        .unwrap_or_else(|| "Miscellaneous".to_string())
}

fn build_regex_table(
    categories: &[Category],
    cat_regex: &[CategoryRegex],
) -> Result<Vec<CachedCategoryRegex>, Error> {
    let category_map: HashMap<i32, &Category> =
        categories.iter().map(|cat| (cat.id, cat)).collect();

    let mut regex: Vec<CachedCategoryRegex> = cat_regex
        .iter()
        .map(|reg| {
            let cat = category_map
                .get(&reg.cat_id)
                .ok_or_else(|| Error::Db("Category not found".to_string()))?;

            let compiled_regex = Regex::new(&reg.regex)
                .map_err(|e| Error::Regex(format!("Invalid regex: {}", e)))?;

            Ok(CachedCategoryRegex {
                category: cat.name.clone(),
                priority: cat.priority,
                regex: compiled_regex,
            })
        })
        .collect::<Result<Vec<_>, Error>>()?;

    regex.sort_by_key(|r| std::cmp::Reverse(r.priority));
    Ok(regex)
}

fn get_week_start(timestamp: i64) -> i64 {
    use chrono::{Datelike, Local, TimeZone, Weekday};
    let dt = Local.timestamp_opt(timestamp, 0).unwrap();

    let days_from_monday = match dt.weekday() {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    };

    let week_start = dt.date_naive().and_hms_opt(0, 0, 0).unwrap()
        - chrono::Duration::days(days_from_monday as i64);

    week_start.and_local_timezone(Local).unwrap().timestamp()
}

fn get_day_start(timestamp: i64) -> i64 {
    use chrono::{Local, TimeZone};
    let dt = Local.timestamp_opt(timestamp, 0).unwrap();

    dt.date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(Local)
        .unwrap()
        .timestamp()
}

fn get_day_of_week(timestamp: i64) -> i32 {
    use chrono::{Datelike, Local, TimeZone, Weekday};
    let dt = Local.timestamp_opt(timestamp, 0).unwrap();

    match dt.weekday() {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    }
}

fn get_hour(timestamp: i64) -> i32 {
    use chrono::{Local, TimeZone, Timelike};
    let dt = Local.timestamp_opt(timestamp, 0).unwrap();
    dt.hour() as i32
}

#[tauri::command]
pub async fn get_week_statistics(week_start: i64, week_end: i64) -> Result<WeekStatistics, Error> {
    let mut logs = get_logs().await?;
    let skipped_apps = get_skipped_apps().await?;

    // Filter skipped apps
    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| Regex::new(&app.regex).ok())
        .collect();

    let is_skipped =
        |app_name: &str| -> bool { skipped_regexes.iter().any(|regex| regex.is_match(app_name)) };

    logs.retain(|log| !is_skipped(&log.app));

    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    let regex = build_regex_table(&categories, &cat_regex)?;

    // Filter logs for the week
    let week_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| log.timestamp >= week_start && log.timestamp <= week_end)
        .collect();

    // Calculate category statistics
    let mut category_durations: HashMap<String, i64> = HashMap::new();
    let mut category_colors: HashMap<String, Option<String>> = HashMap::new();

    for cat in &categories {
        category_colors.insert(cat.name.clone(), cat.color.clone());
    }

    for log in &week_logs {
        let category = derive_category(&log.app, &regex);
        *category_durations.entry(category).or_insert(0) += log.duration;
    }

    let total_time: i64 = category_durations.values().sum();

    // Build category stats
    let mut category_stats: Vec<CategoryStat> = category_durations
        .into_iter()
        .map(|(category, total_duration)| {
            let percentage = if total_time > 0 {
                (total_duration as f64 / total_time as f64) * 100.0
            } else {
                0.0
            };
            CategoryStat {
                category: category.clone(),
                total_duration,
                percentage,
                percentage_change: None, // Will calculate later if needed
                color: category_colors.get(&category).cloned().flatten(),
            }
        })
        .collect();

    category_stats.sort_by(|a, b| b.total_duration.cmp(&a.total_duration));

    // Calculate app statistics
    let mut app_durations: HashMap<String, i64> = HashMap::new();
    for log in &week_logs {
        *app_durations.entry(log.app.clone()).or_insert(0) += log.duration;
    }

    let mut app_stats: Vec<AppStat> = app_durations
        .into_iter()
        .map(|(app, total_duration)| AppStat {
            app,
            total_duration,
            percentage_change: None,
        })
        .collect();

    app_stats.sort_by(|a, b| b.total_duration.cmp(&a.total_duration));
    let mut all_apps = app_stats.clone();
    let mut top_apps: Vec<AppStat> = app_stats.into_iter().take(5).collect();

    // Calculate hourly distribution
    let mut hourly_durations: HashMap<i32, i64> = HashMap::new();
    for log in &week_logs {
        let hour = get_hour(log.timestamp);
        *hourly_durations.entry(hour).or_insert(0) += log.duration;
    }

    let hourly_distribution: Vec<HourlyStat> = (0..24)
        .map(|hour| HourlyStat {
            hour,
            total_duration: hourly_durations.get(&hour).copied().unwrap_or(0),
        })
        .collect();

    // Calculate day category breakdown
    let mut day_category_durations: HashMap<(i32, String), i64> = HashMap::new();
    for log in &week_logs {
        let day = get_day_of_week(log.timestamp);
        let category = derive_category(&log.app, &regex);
        *day_category_durations.entry((day, category)).or_insert(0) += log.duration;
    }

    let day_category_breakdown: Vec<DayCategoryStat> = day_category_durations
        .into_iter()
        .map(|((day, category), total_duration)| DayCategoryStat {
            day,
            category,
            total_duration,
        })
        .collect();

    // Calculate additional statistics
    let mut day_totals: HashMap<i64, i64> = HashMap::new();
    for log in &week_logs {
        let day_start = get_day_start(log.timestamp);
        *day_totals.entry(day_start).or_insert(0) += log.duration;
    }

    let active_days: Vec<i64> = day_totals.keys().copied().collect();
    let number_of_active_days = active_days.len() as i32;
    let first_active_day = active_days.iter().min().copied();

    let most_active_day = day_totals
        .iter()
        .max_by_key(|(_, &duration)| duration)
        .map(|(&timestamp, &duration)| (timestamp, duration));
    let most_inactive_day = day_totals
        .iter()
        .min_by_key(|(_, &duration)| duration)
        .map(|(&timestamp, &duration)| (timestamp, duration));

    // Calculate all-time statistics
    let all_logs = get_logs().await?;
    let all_logs_filtered: Vec<Log> = all_logs
        .into_iter()
        .filter(|log| !is_skipped(&log.app))
        .collect();

    let total_time_all_time: i64 = all_logs_filtered.iter().map(|log| log.duration).sum();

    // Today's total
    use chrono::{Local, TimeZone};
    let today_start = get_day_start(Local::now().timestamp());
    let today_end = today_start + 86400; // 24 hours
    let all_time_today: i64 = all_logs_filtered
        .iter()
        .filter(|log| log.timestamp >= today_start && log.timestamp < today_end)
        .map(|log| log.duration)
        .sum();

    let average_time_active_days = if number_of_active_days > 0 {
        total_time as f64 / number_of_active_days as f64
    } else {
        0.0
    };

    // Calculate previous week for comparison
    let prev_week_start = week_start - 7 * 86400;
    let prev_week_end = week_start;
    let prev_week_logs: Vec<Log> = all_logs_filtered
        .into_iter()
        .filter(|log| log.timestamp >= prev_week_start && log.timestamp < prev_week_end)
        .collect();

    let prev_week_total: i64 = prev_week_logs.iter().map(|log| log.duration).sum();
    let total_time_change = if prev_week_total > 0 {
        Some(((total_time as f64 - prev_week_total as f64) / prev_week_total as f64) * 100.0)
    } else if total_time > 0 {
        Some(100.0)
    } else {
        None
    };

    // Calculate percentage changes for categories
    let mut prev_category_durations: HashMap<String, i64> = HashMap::new();
    for log in &prev_week_logs {
        let category = derive_category(&log.app, &regex);
        *prev_category_durations.entry(category).or_insert(0) += log.duration;
    }

    for stat in &mut category_stats {
        let prev_duration = prev_category_durations
            .get(&stat.category)
            .copied()
            .unwrap_or(0);
        if prev_duration > 0 {
            stat.percentage_change = Some(
                ((stat.total_duration as f64 - prev_duration as f64) / prev_duration as f64)
                    * 100.0,
            );
        } else if stat.total_duration > 0 {
            stat.percentage_change = Some(100.0);
        }
    }

    // Calculate percentage changes for top apps
    let mut prev_app_durations: HashMap<String, i64> = HashMap::new();
    for log in &prev_week_logs {
        *prev_app_durations.entry(log.app.clone()).or_insert(0) += log.duration;
    }

    for app_stat in &mut top_apps {
        let prev_duration = *prev_app_durations.get(&app_stat.app).unwrap_or(&0i64);
        if prev_duration > 0 {
            app_stat.percentage_change = Some(
                ((app_stat.total_duration as f64 - prev_duration as f64) / prev_duration as f64)
                    * 100.0,
            );
        } else if app_stat.total_duration > 0 {
            app_stat.percentage_change = Some(100.0);
        }
    }

    // Calculate percentage changes for all apps
    for app_stat in &mut all_apps {
        let prev_duration: i64 = *prev_app_durations.get(&app_stat.app).unwrap_or(&0i64);
        if prev_duration > 0 {
            app_stat.percentage_change = Some(
                ((app_stat.total_duration as f64 - prev_duration as f64) / prev_duration as f64)
                    * 100.0,
            );
        } else if app_stat.total_duration > 0 {
            app_stat.percentage_change = Some(100.0);
        }
    }

    Ok(WeekStatistics {
        total_time,
        total_time_change,
        categories: category_stats,
        top_apps,
        all_apps,
        hourly_distribution,
        day_category_breakdown,
        first_active_day,
        number_of_active_days,
        total_number_of_days: 7,
        all_time_today,
        total_time_all_time,
        average_time_active_days,
        most_active_day,
        most_inactive_day,
    })
}

#[tauri::command]
pub async fn get_day_statistics(day_start: i64, day_end: i64) -> Result<DayStatistics, Error> {
    let mut logs = get_logs().await?;
    let skipped_apps = get_skipped_apps().await?;

    // Filter skipped apps
    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| Regex::new(&app.regex).ok())
        .collect();

    let is_skipped =
        |app_name: &str| -> bool { skipped_regexes.iter().any(|regex| regex.is_match(app_name)) };

    logs.retain(|log| !is_skipped(&log.app));

    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    let regex = build_regex_table(&categories, &cat_regex)?;

    // Filter logs for the day
    let day_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| log.timestamp >= day_start && log.timestamp <= day_end)
        .collect();

    // Calculate category statistics
    let mut category_durations: HashMap<String, i64> = HashMap::new();
    let mut category_colors: HashMap<String, Option<String>> = HashMap::new();

    for cat in &categories {
        category_colors.insert(cat.name.clone(), cat.color.clone());
    }

    for log in &day_logs {
        let category = derive_category(&log.app, &regex);
        *category_durations.entry(category).or_insert(0) += log.duration;
    }

    let total_time: i64 = category_durations.values().sum();

    // Build category stats
    let mut category_stats: Vec<CategoryStat> = category_durations
        .into_iter()
        .map(|(category, total_duration)| {
            let percentage = if total_time > 0 {
                (total_duration as f64 / total_time as f64) * 100.0
            } else {
                0.0
            };
            CategoryStat {
                category: category.clone(),
                total_duration,
                percentage,
                percentage_change: None,
                color: category_colors.get(&category).cloned().flatten(),
            }
        })
        .collect();

    category_stats.sort_by(|a, b| b.total_duration.cmp(&a.total_duration));

    // Calculate app statistics
    let mut app_durations: HashMap<String, i64> = HashMap::new();
    for log in &day_logs {
        *app_durations.entry(log.app.clone()).or_insert(0) += log.duration;
    }

    let mut app_stats: Vec<AppStat> = app_durations
        .into_iter()
        .map(|(app, total_duration)| AppStat {
            app,
            total_duration,
            percentage_change: None,
        })
        .collect();

    app_stats.sort_by(|a, b| b.total_duration.cmp(&a.total_duration));
    let top_apps = app_stats.into_iter().take(5).collect();

    // Calculate hourly distribution
    let mut hourly_durations: HashMap<i32, i64> = HashMap::new();
    for log in &day_logs {
        let hour = get_hour(log.timestamp);
        *hourly_durations.entry(hour).or_insert(0) += log.duration;
    }

    let hourly_distribution: Vec<HourlyStat> = (0..24)
        .map(|hour| HourlyStat {
            hour,
            total_duration: hourly_durations.get(&hour).copied().unwrap_or(0),
        })
        .collect();

    Ok(DayStatistics {
        total_time,
        categories: category_stats,
        top_apps,
        hourly_distribution,
    })
}
