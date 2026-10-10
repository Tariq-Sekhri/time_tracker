use crate::db;
use crate::db::tables::app_group::{
    build_app_group_matchers, get_app_groups, resolve_app_group, CachedAppGroup,
};
use cat_regex::{get_cat_regex, CategoryRegex};
use category::{get_categories, Category};
use chrono::{Datelike, Timelike};
use db::error::Error;
use db::tables::{cat_regex, category, log, skipped_app};
use log::get_logs;
use log::Log;
use regex::Regex;
use serde::{Deserialize, Serialize};
use skipped_app::get_skipped_apps;
use std::collections::{BTreeSet, HashMap};

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
    pub app_names: Vec<String>,
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

const MANUAL_DEVICE: &str = "manual-time-statistics";
const MANUAL_PROJECT_DEVICE_PREFIX: &str = "manual-time-statistics:";
const MANUAL_CATEGORY: &str = "Manual time";

#[cfg(test)]
static BENCHMARK_NOW: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

fn statistics_now() -> i64 {
    #[cfg(test)]
    {
        let frozen = BENCHMARK_NOW.load(std::sync::atomic::Ordering::Relaxed);
        if frozen != 0 { return frozen; }
    }
    chrono::Local::now().timestamp()
}

async fn add_manual_category_colors(colors: &mut HashMap<String, Option<String>>) -> Result<(), Error> {
    let palette = ["#0ea5e9", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee"];
    colors.insert(MANUAL_CATEGORY.into(), Some(palette[0].into()));
    for project in crate::db::tables::manual_project::get_manual_projects().await? {
        colors.entry(project.name).or_insert_with(|| Some(palette[(project.id as usize) % palette.len()].into()));
    }
    Ok(())
}

fn is_manual(log: &Log) -> bool {
    log.device_uuid.as_deref().is_some_and(|device| device == MANUAL_DEVICE || device.starts_with(MANUAL_PROJECT_DEVICE_PREFIX))
}

fn log_category(log: &Log, regexes: &[CachedCategoryRegex]) -> String {
    if is_manual(log) {
        log.device_uuid.as_deref().and_then(|device| device.strip_prefix(MANUAL_PROJECT_DEVICE_PREFIX)).unwrap_or(MANUAL_CATEGORY).to_string()
    } else {
        derive_category(&log.app, regexes)
    }
}

// Apply before aggregation so totals, app groups, and comparisons share a scope.
fn retain_statistics_categories(logs: &mut Vec<Log>, names: Option<&[String]>, regexes: &[CachedCategoryRegex]) {
    let Some(names) = names else { return; };
    logs.retain(|log| names.contains(&log_category(log, regexes)));
}

#[cfg(test)]
mod isolation_tests {
    use super::*;

    #[test]
    fn statistics_isolation_combines_device_and_category_before_app_aggregation() {
        let regexes = vec![CachedCategoryRegex {regex: Regex::new("Editor").unwrap(), category: "Work".into(), priority: 0}];
        let logs = vec![("desktop", "Editor", 20), ("phone", "Editor", 30), ("desktop", "Browser", 40)]
            .into_iter().enumerate().map(|(id, (device, app, duration))| Log {
                id: id as i64, device_uuid: Some(device.into()), app: app.into(), timestamp: 100, duration, is_deleted: false,
            }).collect::<Vec<_>>();
        let mut scoped = crate::db::tables::device::filter_logs_by_devices(logs.clone(), Some(vec!["desktop".into()]), Some("desktop".into()));
        retain_statistics_categories(&mut scoped, Some(&["Work".into()]), &regexes);
        assert_eq!(scoped.len(), 1);
        assert_eq!(scoped[0].duration, 20);
        assert_eq!(app_duration_map(&scoped, &[]).values().sum::<i64>(), 20);
        retain_statistics_categories(&mut scoped, Some(&[]), &regexes);
        assert!(scoped.is_empty());
        let mut restored = logs.clone();
        retain_statistics_categories(&mut restored, None, &regexes);
        assert_eq!(restored.len(), logs.len());
    }
}

// Aggregation-only segments preserve the original block and its notes.
fn manual_segments(
    blocks: &[crate::db::tables::manual_time_block::ManualTimeBlock],
    start: i64,
    end: i64,
) -> Vec<Log> {
    use chrono::{Local, TimeZone};
    let mut segments = Vec::new();
    for block in blocks {
        let mut cursor = block.start_time.max(start);
        let stop = block.end_time.min(end);
        while cursor < stop {
            let Some(local) = Local.timestamp_opt(cursor, 0).single() else {
                break;
            };
            let next_hour =
                cursor + 3600 - i64::from(local.minute()) * 60 - i64::from(local.second());
            let segment_end = next_hour.min(stop);
            segments.push(Log {
                id: block.id,
                device_uuid: Some(block.project_name.as_ref().map(|name| format!("{MANUAL_DEVICE}:{name}")).unwrap_or_else(|| MANUAL_DEVICE.into())),
                app: format!("Manual time: {}", block.title),
                timestamp: cursor,
                duration: segment_end - cursor,
                is_deleted: false,
            });
            cursor = segment_end;
        }
    }
    segments
}

async fn manual_statistics_logs(
    start: i64,
    end: i64,
    include: Option<bool>,
) -> Result<Vec<Log>, Error> {
    if include == Some(false) || end <= start {
        return Ok(Vec::new());
    }
    let blocks = crate::db::tables::manual_time_block::get_manual_time_blocks(start, end).await?;
    Ok(manual_segments(&blocks, start, end))
}

#[derive(Clone)]
struct CachedCategoryRegex {
    regex: Regex,
    category: String,
    priority: i32,
}

#[derive(PartialEq, Eq)]
struct CategoryMatcherKey {
    categories: Vec<(i32, String, i32)>,
    patterns: Vec<(i32, String)>,
}

static CATEGORY_MATCHER_CACHE: std::sync::Mutex<Option<(CategoryMatcherKey, Vec<CachedCategoryRegex>)>> = std::sync::Mutex::new(None);

// The trend consumes only totals and series. It should not pay for sidebar,
// previous-period comparisons, or all-history statistics for every point.
#[derive(Deserialize, Debug, Clone)]
pub struct StatisticsRange {
    pub week_start: i64,
    pub week_end: i64,
}

#[derive(Serialize, Debug, Clone)]
pub struct TrendWeekStatistics {
    pub total_time: i64,
    pub categories: Vec<CategoryStat>,
    pub all_apps: Vec<AppStat>,
}

#[derive(Serialize)]
pub struct StatisticsBounds {
    pub first_active_day: Option<i64>,
    pub total_time_all_time: i64,
}

fn retain_unskipped(logs: &mut Vec<Log>, regexes: &[Regex]) {
    let mut cache = HashMap::<String, bool>::new();
    logs.retain(|log| {
        if let Some(skipped) = cache.get(&log.app) { return !skipped; }
        let skipped = regexes.iter().any(|regex| regex.is_match(&log.app));
        cache.insert(log.app.clone(), skipped);
        !skipped
    });
}

async fn skip_matchers() -> Result<Vec<Regex>, Error> {
    Ok(get_skipped_apps().await?.iter().filter_map(|app|
        crate::logger::Log::result("Invalid skipped-app regex", Regex::new(&app.regex)).ok()).collect())
}

// Aggregate in SQLite before transferring rows, but retain the exact local day
// and hour of every sample so category/day/hour charts keep their old semantics.
#[cfg(test)]
async fn aggregate_statistics_logs_from_pool(pool: &sqlx::SqlitePool) -> Result<Vec<Log>, Error> {
    Ok(sqlx::query_as::<_, Log>(
        "SELECT MIN(id) AS id, device_uuid, app, MIN(timestamp) AS timestamp,
         SUM(duration) AS duration, 0 AS is_deleted FROM logs WHERE is_deleted = 0
         GROUP BY device_uuid, app, strftime('%Y-%m-%d %H', timestamp, 'unixepoch', 'localtime')"
    ).fetch_all(pool).await?)
}

async fn tracking_totals(skipped: &[Regex], today_start: i64) -> Result<(i64, i64), Error> {
    let pool = db::get_pool().await?;
    let rows: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT app, SUM(duration), SUM(CASE WHEN timestamp >= ?1 AND timestamp < ?2 THEN duration ELSE 0 END)
         FROM logs WHERE is_deleted = 0 GROUP BY app"
    ).bind(today_start).bind(today_start + 86400).fetch_all(&pool).await?;
    let mut total = 0;
    let mut today = 0;
    for (app, duration, today_duration) in rows {
        if !skipped.iter().any(|regex| regex.is_match(&app)) {
            total += duration;
            today += today_duration;
        }
    }
    Ok((total, today))
}

#[tauri::command]
pub async fn get_statistics_bounds(include_manual: Option<bool>) -> Result<StatisticsBounds, Error> {
    let mut perf = crate::perf::Perf::new("get_statistics_bounds");
    let pool = db::get_pool().await?;
    let rows: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT app, MIN(timestamp), SUM(duration) FROM logs WHERE is_deleted = 0 GROUP BY app"
    ).fetch_all(&pool).await?;
    let skipped = skip_matchers().await?;
    let mut first = None::<i64>;
    let mut total = 0;
    for (app, timestamp, duration) in rows {
        if skipped.iter().any(|regex| regex.is_match(&app)) { continue; }
        first = Some(first.map_or(timestamp, |old| old.min(timestamp)));
        total += duration;
    }
    if include_manual != Some(false) {
        for block in crate::db::tables::manual_time_block::get_manual_time_blocks(i64::MIN, i64::MAX).await? {
            if block.end_time > block.start_time {
                first = Some(first.map_or(block.start_time, |old| old.min(block.start_time)));
                total += block.end_time - block.start_time;
            }
        }
    }
    perf.done();
    Ok(StatisticsBounds {first_active_day: first.map(get_day_start), total_time_all_time: total})
}

#[tauri::command]
pub async fn get_trend_statistics(
    weeks: Vec<StatisticsRange>,
    device_uuids: Option<Vec<String>>,
    include_manual: Option<bool>,
) -> Result<Vec<TrendWeekStatistics>, Error> {
    let mut perf = crate::perf::Perf::new("get_trend_statistics");
    perf.note("weeks", weeks.len());
    if weeks.is_empty() { return Ok(Vec::new()); }
    if weeks.iter().any(|week| week.week_end < week.week_start) {
        return Err(anyhow::anyhow!("Invalid trend interval").into());
    }
    let start = weeks.iter().map(|week| week.week_start).min().unwrap();
    let end = weeks.iter().map(|week| week.week_end).max().unwrap().min(chrono::Local::now().timestamp());
    let local_uuid = crate::db::tables::device::get_local_log_device_uuid().await?;
    let mut logs = log::get_logs_in_time_range(start, end).await?;
    perf.stage("range_read");
    retain_unskipped(&mut logs, &skip_matchers().await?);
    logs = crate::db::tables::device::filter_logs_by_devices(logs, device_uuids, local_uuid);
    let categories = get_categories().await?;
    let regexes = build_regex_table(&categories, &get_cat_regex().await?)?;
    let groups = build_app_group_matchers(&get_app_groups().await?)?;
    let mut colors: HashMap<String, Option<String>> = categories.into_iter().map(|category| (category.name, category.color)).collect();
    add_manual_category_colors(&mut colors).await?;
    let manual_blocks = if include_manual == Some(false) || end < start { Vec::new() } else {
        crate::db::tables::manual_time_block::get_manual_time_blocks(start, end.saturating_add(1)).await?
    };
    perf.stage("rules_manual");
    // Classify titles once across the entire batch, including titles repeated
    // in different weeks. Borrow logs rather than cloning their window titles.
    let mut category_cache = HashMap::<String, String>::new();
    let mut group_cache = HashMap::<String, String>::new();
    let mut ordered_weeks: Vec<(usize, &StatisticsRange)> = weeks.iter().enumerate().collect();
    ordered_weeks.sort_by_key(|(_, week)| week.week_start);
    let disjoint = ordered_weeks.windows(2).all(|pair| pair[0].1.week_end < pair[1].1.week_start);
    let mut buckets = vec![Vec::<&Log>::new(); weeks.len()];
    for sample in &logs {
        let limit = ordered_weeks.partition_point(|(_, week)| week.week_start <= sample.timestamp);
        if disjoint {
            if let Some((index, week)) = limit.checked_sub(1).map(|index| ordered_weeks[index]) {
                if sample.timestamp <= week.week_end { buckets[index].push(sample); }
            }
        } else {
            // Overlapping/custom input ranges retain the same independent sums.
            for (index, week) in &ordered_weeks[..limit] {
                if sample.timestamp <= week.week_end { buckets[*index].push(sample); }
            }
        }
    }
    let mut result = Vec::with_capacity(weeks.len());
    for (index, week) in weeks.iter().enumerate() {
        let manual = manual_segments(&manual_blocks, week.week_start, week.week_end.min(end).saturating_add(1));
        let mut category_totals = HashMap::<String, i64>::new();
        let mut app_totals = HashMap::<String, (i64, BTreeSet<String>)>::new();
        for sample in buckets[index].iter().copied().chain(manual.iter()) {
            let category = if is_manual(sample) { log_category(sample, &regexes) } else {
                derive_category_cached(&sample.app, &regexes, &mut category_cache)
            };
            *category_totals.entry(category).or_default() += sample.duration;
            let app = if is_manual(sample) { sample.app.clone() } else {
                group_cache.entry(sample.app.clone()).or_insert_with(|| resolve_app_group(&sample.app, &groups).to_string()).clone()
            };
            let entry = app_totals.entry(app).or_default();
            entry.0 += sample.duration;
            if !is_manual(sample) { entry.1.insert(sample.app.clone()); }
        }
        let total_time: i64 = category_totals.values().sum();
        let mut categories: Vec<CategoryStat> = category_totals.into_iter().map(|(category,total_duration)| CategoryStat {
            color: colors.get(&category).cloned().flatten(), category, total_duration,
            percentage: if total_time > 0 { (total_duration as f64 / total_time as f64) * 100.0 } else {0.0}, percentage_change: None,
        }).collect();
        categories.sort_by(|a,b| b.total_duration.cmp(&a.total_duration));
        let mut all_apps: Vec<AppStat> = app_totals.into_iter().map(|(app,(total_duration,names))| AppStat {
            app, total_duration, app_names: names.into_iter().collect(), percentage_change: None,
        }).collect();
        all_apps.sort_by(|a,b| b.total_duration.cmp(&a.total_duration).then_with(|| a.app.cmp(&b.app)));
        result.push(TrendWeekStatistics { total_time, categories, all_apps });
    }
    perf.stage("aggregate_batch");
    perf.done();
    crate::perf::payload_probe("get_trend_statistics_payload", &result);
    Ok(result)
}

fn build_app_stats(logs: &[Log], app_groups: &[CachedAppGroup]) -> Vec<AppStat> {
    let mut app_durations: HashMap<String, (i64, BTreeSet<String>)> = HashMap::new();
    let mut group_cache = HashMap::<&str, &str>::new();
    for log in logs {
        let app = if is_manual(log) {
            log.app.clone()
        } else {
            (*group_cache.entry(&log.app).or_insert_with(|| resolve_app_group(&log.app, app_groups))).to_string()
        };
        let entry = app_durations.entry(app).or_default();
        entry.0 += log.duration;
        if !is_manual(log) {
            entry.1.insert(log.app.clone());
        }
    }

    let mut app_stats: Vec<AppStat> = app_durations
        .into_iter()
        .map(|(app, (total_duration, app_names))| AppStat {
            app,
            app_names: app_names.into_iter().collect(),
            total_duration,
            percentage_change: None,
        })
        .collect();
    app_stats.sort_by(|left, right| {
        right
            .total_duration
            .cmp(&left.total_duration)
            .then_with(|| left.app.cmp(&right.app))
    });
    app_stats
}

fn app_duration_map(logs: &[Log], app_groups: &[CachedAppGroup]) -> HashMap<String, i64> {
    let mut durations = HashMap::new();
    let mut group_cache = HashMap::<&str, &str>::new();
    for log in logs {
        let app = if is_manual(log) {
            log.app.clone()
        } else {
            (*group_cache.entry(&log.app).or_insert_with(|| resolve_app_group(&log.app, app_groups))).to_string()
        };
        *durations.entry(app).or_insert(0) += log.duration;
    }
    durations
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

fn derive_category_cached(
    app: &str,
    regexes: &[CachedCategoryRegex],
    cache: &mut HashMap<String, String>,
) -> String {
    if let Some(category) = cache.get(app) {
        return category.clone();
    }
    let category = derive_category(app, regexes);
    cache.insert(app.to_string(), category.clone());
    category
}

fn build_regex_table(
    categories: &[Category],
    cat_regex: &[CategoryRegex],
) -> Result<Vec<CachedCategoryRegex>, Error> {
    let key = CategoryMatcherKey {
        categories: categories.iter().map(|category| (category.id, category.name.clone(), category.priority)).collect(),
        patterns: cat_regex.iter().map(|pattern| (pattern.cat_id, pattern.regex.clone())).collect(),
    };
    {
        let cache = CATEGORY_MATCHER_CACHE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some((cached_key, matchers)) = cache.as_ref() {
            if cached_key == &key { return Ok(matchers.clone()); }
        }
    }
    let category_map: HashMap<i32, &Category> =
        categories.iter().map(|cat| (cat.id, cat)).collect();

    let mut regex: Vec<CachedCategoryRegex> = cat_regex
        .iter()
        .map(|reg| {
            let cat = category_map
                .get(&reg.cat_id)
                .ok_or_else(|| anyhow::anyhow!("Category not found"))?;

            let compiled_regex = Regex::new(&reg.regex)?;

            Ok(CachedCategoryRegex {
                category: cat.name.clone(),
                priority: cat.priority,
                regex: compiled_regex,
            })
        })
        .collect::<Result<Vec<_>, Error>>()?;

    regex.sort_by_key(|r| std::cmp::Reverse(r.priority));
    *CATEGORY_MATCHER_CACHE.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some((key, regex.clone()));
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct StatisticsTimeParts {
    hour: i32,
    weekday: i32,
    day_start: i64,
}

#[derive(Default)]
struct StatisticsClock {
    hours: HashMap<i64, Option<StatisticsTimeParts>>,
    days: HashMap<chrono::NaiveDate, i64>,
}

impl StatisticsClock {
    fn from_local(&mut self, local: chrono::DateTime<chrono::Local>) -> StatisticsTimeParts {
        let date = local.date_naive();
        let day_start = *self.days.entry(date).or_insert_with(|| {
            date.and_hms_opt(0, 0, 0).unwrap().and_local_timezone(chrono::Local).unwrap().timestamp()
        });
        StatisticsTimeParts {hour: local.hour() as i32, weekday: local.weekday().num_days_from_monday() as i32, day_start}
    }

    fn parts(&mut self, timestamp: i64) -> StatisticsTimeParts {
        use chrono::{Local, TimeZone};
        let bucket = timestamp.div_euclid(3600);
        if let Some(cached) = self.hours.get(&bucket) {
            if let Some(parts) = cached { return *parts; }
            return self.from_local(Local.timestamp_opt(timestamp, 0).unwrap());
        }
        let start = bucket * 3600;
        let first = Local.timestamp_opt(start, 0).unwrap();
        let last = Local.timestamp_opt(start + 3599, 0).unwrap();
        // Do not cache a UTC hour that crosses a local hour/day or an offset
        // transition. Fractional-hour zones and transition buckets fall back
        // to exact per-sample conversion; local midnight is cached separately.
        if first.date_naive() == last.date_naive() && first.hour() == last.hour()
            && first.offset().local_minus_utc() == last.offset().local_minus_utc() {
            let parts = self.from_local(first);
            self.hours.insert(bucket, Some(parts));
            parts
        } else {
            self.hours.insert(bucket, None);
            self.from_local(Local.timestamp_opt(timestamp, 0).unwrap())
        }
    }
}

#[cfg(test)]
mod statistics_clock_tests {
    use super::*;
    use chrono::{Local, TimeZone};

    #[test]
    fn cached_time_parts_match_exact_conversion_across_midnight_and_dst() {
        let mut clock = StatisticsClock::default();
        for (month, day) in [(3, 7), (11, 1), (9, 28)] {
            let start = Local.with_ymd_and_hms(2026, month, day, 0, 0, 0).unwrap().timestamp();
            for offset in (0..3 * 86400).step_by(137) {
                let timestamp = start + offset;
                assert_eq!(clock.parts(timestamp), StatisticsTimeParts {
                    hour: get_hour(timestamp), weekday: get_day_of_week(timestamp), day_start: get_day_start(timestamp),
                }, "Timestamp {timestamp}");
            }
        }
        assert!(clock.hours.len() < 250);
    }
}

fn get_hour(timestamp: i64) -> i32 {
    use chrono::{Local, TimeZone, Timelike};
    let dt = Local.timestamp_opt(timestamp, 0).unwrap();
    dt.hour() as i32
}

#[tauri::command]
pub async fn get_week_statistics(
    week_start: i64,
    week_end: i64,
    device_uuids: Option<Vec<String>>,
    include_manual: Option<bool>,
    category_names: Option<Vec<String>>,
) -> Result<WeekStatistics, Error> {
    let stats = week_statistics_with_range_reuse(week_start, week_end, device_uuids, include_manual, true, category_names).await?;
    crate::perf::payload_probe("get_week_statistics_payload", &stats);
    Ok(stats)
}

async fn week_statistics(
    week_start: i64,
    week_end: i64,
    device_uuids: Option<Vec<String>>,
    include_manual: Option<bool>,
) -> Result<WeekStatistics, Error> {
    week_statistics_with_range_reuse(week_start, week_end, device_uuids, include_manual, true, None).await
}

async fn week_statistics_with_range_reuse(
    week_start: i64,
    week_end: i64,
    device_uuids: Option<Vec<String>>,
    include_manual: Option<bool>,
    reuse_range: bool,
    category_names: Option<Vec<String>>,
) -> Result<WeekStatistics, Error> {
    use chrono::{Local, TimeZone};

    let mut perf = crate::perf::Perf::new("get_week_statistics");
    let mut clock = StatisticsClock::default();
    perf.note("range_days", (week_end - week_start + 1) / 86400);
    perf.note("include_manual", include_manual.unwrap_or(true));
    perf.note("device_filter", device_uuids.as_ref().map_or(0, |uuids| uuids.len()));
    let local_uuid = crate::db::tables::device::get_local_log_device_uuid().await?;
    perf.stage("local_uuid");
    let now = statistics_now();
    let compare_end = week_end.min(now);
    let prev_week_start = week_start - 7 * 86400;
    let prev_compare_end = prev_week_start + (compare_end - week_start);
    // Detailed's long current/previous windows mostly overlap. Read their union
    // once, preserving the previous-period device semantics before filtering.
    let share_range = reuse_range && week_end.saturating_sub(week_start) > 31 * 86400;
    let mut logs = log::get_logs_in_time_range(if share_range { prev_week_start } else { week_start }, week_end).await?;
    let previous_snapshot = share_range.then(|| logs.iter()
        .filter(|log| !is_manual(log) && log.timestamp >= prev_week_start && log.timestamp <= prev_compare_end)
        .cloned().collect::<Vec<_>>());
    if share_range { logs.retain(|log| log.timestamp >= week_start); }
    perf.stage("get_logs");
    perf.note("all_logs", logs.len());
    let skipped_apps = get_skipped_apps().await?;

    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| {
            crate::logger::Log::result("Invalid skipped-app regex", Regex::new(&app.regex)).ok()
        })
        .collect();
    perf.stage("skip_regex_build");
    perf.note("skip_regexes", skipped_regexes.len());

    retain_unskipped(&mut logs, &skipped_regexes);
    perf.stage("skip_filter");
    perf.note("after_skip", logs.len());

    logs = crate::db::tables::device::filter_logs_by_devices(logs, device_uuids.clone(), local_uuid.clone());
    perf.stage("device_filter");
    perf.note("after_devices", logs.len());

    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    perf.stage("load_rules");
    let regex = build_regex_table(&categories, &cat_regex)?;
    perf.stage("compile_rules");
    perf.note("category_regexes", regex.len());
    perf.note("categories", categories.len());
    let app_groups = build_app_group_matchers(&get_app_groups().await?)?;
    perf.stage("app_groups");
    perf.note("app_groups", app_groups.len());

    let manual_logs =
        manual_statistics_logs(week_start, compare_end.saturating_add(1), include_manual).await?;
    perf.stage("manual");
    perf.note("manual_segments", manual_logs.len());
    logs.extend(manual_logs);

    retain_statistics_categories(&mut logs, category_names.as_deref(), &regex);

    let week_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| log.timestamp >= week_start && log.timestamp <= week_end)
        .collect();
    perf.stage("range_filter");
    perf.note("week_logs", week_logs.len());

    let period_logs: Vec<Log> = week_logs
        .iter()
        .filter(|log| log.timestamp <= compare_end)
        .cloned()
        .collect();
    perf.stage("period_filter");
    perf.note("period_logs", period_logs.len());
    perf.note(
        "distinct_titles",
        period_logs.iter().map(|log| log.app.as_str()).collect::<std::collections::HashSet<_>>().len(),
    );

    let mut category_durations: HashMap<String, i64> = HashMap::new();
    let mut category_cache = HashMap::<String, String>::new();
    let mut category_colors: HashMap<String, Option<String>> = HashMap::new();

    for cat in &categories {
        category_colors.insert(cat.name.clone(), cat.color.clone());
    }
    add_manual_category_colors(&mut category_colors).await?;
    perf.stage("colors");

    for log in &period_logs {
        let category = if is_manual(log) { log_category(log, &regex) } else { derive_category_cached(&log.app, &regex, &mut category_cache) };
        *category_durations.entry(category).or_insert(0) += log.duration;
    }
    perf.stage("categorize");

    let total_time: i64 = category_durations.values().sum();

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
    perf.stage("category_stats");

    let app_stats = build_app_stats(&period_logs, &app_groups);
    let mut all_apps = app_stats.clone();
    let mut top_apps: Vec<AppStat> = app_stats.into_iter().take(5).collect();
    perf.stage("app_stats");
    perf.note("apps", all_apps.len());
    perf.note("app_names_total", all_apps.iter().map(|app| app.app_names.len()).sum::<usize>());

    let mut hourly_durations: HashMap<i32, i64> = HashMap::new();
    for log in &period_logs {
        let hour = clock.parts(log.timestamp).hour;
        *hourly_durations.entry(hour).or_insert(0) += log.duration;
    }

    let hourly_distribution: Vec<HourlyStat> = (0..=24)
        .map(|hour| HourlyStat {
            hour,
            total_duration: hourly_durations.get(&hour).copied().unwrap_or(0),
        })
        .collect();
    perf.stage("hourly");

    let mut day_category_durations: HashMap<(i32, String), i64> = HashMap::new();
    for log in &period_logs {
        let day = clock.parts(log.timestamp).weekday;
        let category = if is_manual(log) { log_category(log, &regex) } else { derive_category_cached(&log.app, &regex, &mut category_cache) };
        *day_category_durations.entry((day, category)).or_insert(0) += log.duration;
    }
    perf.stage("day_category");

    let day_category_breakdown: Vec<DayCategoryStat> = day_category_durations
        .into_iter()
        .map(|((day, category), total_duration)| DayCategoryStat {
            day,
            category,
            total_duration,
        })
        .collect();

    let mut day_totals: HashMap<i64, i64> = HashMap::new();
    for log in &period_logs {
        let day_start = clock.parts(log.timestamp).day_start;
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
    perf.stage("day_totals");
    perf.note("active_days", number_of_active_days);

    let today_start = get_day_start(Local::now().timestamp());
    let (mut total_time_all_time, mut all_time_today) = tracking_totals(&skipped_regexes, today_start).await?;
    perf.stage("all_time_sums_query");
    let all_time_manual = manual_statistics_logs(i64::MIN, i64::MAX, include_manual).await?;
    total_time_all_time += all_time_manual.iter().map(|log| log.duration).sum::<i64>();
    all_time_today += all_time_manual.iter().filter(|log| log.timestamp >= today_start && log.timestamp < today_start + 86400).map(|log| log.duration).sum::<i64>();
    let average_time_active_days = if number_of_active_days > 0 {
        total_time as f64 / number_of_active_days as f64
    } else {
        0.0
    };

    perf.stage("all_time_sums");

    let mut prev_week_logs: Vec<Log> = match previous_snapshot {
        Some(logs) => logs,
        None => log::get_logs_in_time_range(prev_week_start, prev_compare_end).await?
        .into_iter()
        .filter(|log| {
            !is_manual(log) && log.timestamp >= prev_week_start && log.timestamp <= prev_compare_end
        })
        .collect(),
    };
    retain_unskipped(&mut prev_week_logs, &skipped_regexes);
    if category_names.is_some() {
        prev_week_logs = crate::db::tables::device::filter_logs_by_devices(prev_week_logs, device_uuids, local_uuid);
    }
    perf.stage("prev_filter");

    prev_week_logs.extend(
        manual_statistics_logs(
            prev_week_start,
            prev_compare_end.saturating_add(1),
            include_manual,
        )
        .await?,
    );
    retain_statistics_categories(&mut prev_week_logs, category_names.as_deref(), &regex);
    perf.stage("prev_manual");
    perf.note("prev_logs", prev_week_logs.len());

    let prev_week_total: i64 = prev_week_logs.iter().map(|log| log.duration).sum();
    let total_time_change = if prev_week_total > 0 {
        Some(((total_time as f64 - prev_week_total as f64) / prev_week_total as f64) * 100.0)
    } else if total_time > 0 {
        Some(100.0)
    } else {
        None
    };

    let mut prev_category_durations: HashMap<String, i64> = HashMap::new();
    for log in &prev_week_logs {
        let category = if is_manual(log) { log_category(log, &regex) } else { derive_category_cached(&log.app, &regex, &mut category_cache) };
        *prev_category_durations.entry(category).or_insert(0) += log.duration;
    }
    perf.stage("prev_categorize");

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

    let prev_app_durations = app_duration_map(&prev_week_logs, &app_groups);
    perf.stage("prev_app_map");

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
    perf.stage("pct_changes");
    perf.done();

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
pub async fn get_total_statistics(include_manual: Option<bool>) -> Result<WeekStatistics, Error> {
    let stats = total_statistics(include_manual).await?;
    crate::perf::payload_probe("get_total_statistics_payload", &stats);
    Ok(stats)
}

async fn total_statistics(include_manual: Option<bool>) -> Result<WeekStatistics, Error> {
    use chrono::{Local, TimeZone};

    let mut perf = crate::perf::Perf::new("get_total_statistics");
    let mut clock = StatisticsClock::default();
    perf.note("include_manual", include_manual.unwrap_or(true));
    let mut logs = get_logs().await?;
    perf.stage("get_logs");
    perf.note("all_logs", logs.len());
    let skipped_apps = get_skipped_apps().await?;

    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| {
            crate::logger::Log::result("Invalid skipped-app regex", Regex::new(&app.regex)).ok()
        })
        .collect();



    perf.stage("skip_regex_build");
    perf.note("skip_regexes", skipped_regexes.len());
    retain_unskipped(&mut logs, &skipped_regexes);
    perf.stage("skip_filter");
    perf.note("after_skip", logs.len());
    let manual_logs = manual_statistics_logs(i64::MIN, i64::MAX, include_manual).await?;
    perf.stage("manual");
    perf.note("manual_segments", manual_logs.len());
    logs.extend(manual_logs);

    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    perf.stage("load_rules");
    let regex = build_regex_table(&categories, &cat_regex)?;
    perf.stage("compile_rules");
    perf.note("category_regexes", regex.len());
    let app_groups = build_app_group_matchers(&get_app_groups().await?)?;
    perf.stage("app_groups");
    perf.note("app_groups", app_groups.len());

    let mut category_durations: HashMap<String, i64> = HashMap::new();

    let mut category_colors: HashMap<String, Option<String>> = HashMap::new();

    for cat in &categories {
        category_colors.insert(cat.name.clone(), cat.color.clone());
    }
    add_manual_category_colors(&mut category_colors).await?;
    perf.stage("colors");

    let mut hourly_durations: HashMap<i32, i64> = HashMap::new();
    let mut day_category_durations: HashMap<(i32, String), i64> = HashMap::new();
    let mut day_totals: HashMap<i64, i64> = HashMap::new();
    let mut app_category_cache: HashMap<String, String> = HashMap::new();

    for log in &logs {
        let category = if is_manual(log) {
            log_category(log, &regex)
        } else {
            derive_category_cached(&log.app, &regex, &mut app_category_cache)
        };
        *category_durations.entry(category.clone()).or_insert(0) += log.duration;
        let parts = clock.parts(log.timestamp);
        let hour = parts.hour;
        *hourly_durations.entry(hour).or_insert(0) += log.duration;

        let day = parts.weekday;
        *day_category_durations
            .entry((day, category.clone()))
            .or_insert(0) += log.duration;

        let day_start = parts.day_start;
        *day_totals.entry(day_start).or_insert(0) += log.duration;
    }
    perf.stage("main_loop");
    perf.note("distinct_titles", app_category_cache.len());
    perf.note("active_days", day_totals.len());

    let total_time: i64 = category_durations.values().sum();

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

    perf.stage("category_stats");
    let app_stats = build_app_stats(&logs, &app_groups);
    let all_apps = app_stats.clone();
    let top_apps: Vec<AppStat> = app_stats.into_iter().take(5).collect();
    perf.stage("app_stats");
    perf.note("apps", all_apps.len());
    perf.note("app_names_total", all_apps.iter().map(|app| app.app_names.len()).sum::<usize>());

    let hourly_distribution: Vec<HourlyStat> = (0..=24)
        .map(|hour| HourlyStat {
            hour,
            total_duration: hourly_durations.get(&hour).copied().unwrap_or(0),
        })
        .collect();

    let day_category_breakdown: Vec<DayCategoryStat> = day_category_durations
        .into_iter()
        .map(|((day, category), total_duration)| DayCategoryStat {
            day,
            category,
            total_duration,
        })
        .collect();

    let first_active_day = day_totals.keys().min().copied();
    let most_active_day = day_totals
        .iter()
        .max_by_key(|(_, &duration)| duration)
        .map(|(&timestamp, &duration)| (timestamp, duration));
    let most_inactive_day = day_totals
        .iter()
        .min_by_key(|(_, &duration)| duration)
        .map(|(&timestamp, &duration)| (timestamp, duration));

    let number_of_active_days = day_totals.len() as i32;
    let total_number_of_days = match (
        day_totals.keys().min().copied(),
        day_totals.keys().max().copied(),
    ) {
        (Some(min_ts), Some(max_ts)) => ((max_ts - min_ts) / 86400 + 1) as i32,
        _ => 0,
    };

    let today_start = get_day_start(Local::now().timestamp());
    let today_end = today_start + 86400;
    let all_time_today: i64 = logs
        .iter()
        .filter(|log| log.timestamp >= today_start && log.timestamp < today_end)
        .map(|log| log.duration)
        .sum();

    let average_time_active_days = if number_of_active_days > 0 {
        total_time as f64 / number_of_active_days as f64
    } else {
        0.0
    };
    perf.stage("finish");
    perf.done();

    Ok(WeekStatistics {
        total_time,
        total_time_change: None,
        categories: category_stats,
        top_apps,
        all_apps,
        hourly_distribution,
        day_category_breakdown,
        first_active_day,
        number_of_active_days,
        total_number_of_days,
        all_time_today,
        total_time_all_time: total_time,
        average_time_active_days,
        most_active_day,
        most_inactive_day,
    })
}

#[tauri::command]
pub async fn get_day_statistics(
    day_start: i64,
    day_end: i64,
    device_uuids: Option<Vec<String>>,
    include_manual: Option<bool>,
    category_names: Option<Vec<String>>,
) -> Result<DayStatistics, Error> {
    let mut perf = crate::perf::Perf::new("get_day_statistics");
    let mut clock = StatisticsClock::default();
    let local_uuid = crate::db::tables::device::get_local_log_device_uuid().await?;
    let mut logs = log::get_logs_in_time_range(day_start, day_end).await?;
    perf.stage("get_logs");
    perf.note("all_logs", logs.len());
    let skipped_apps = get_skipped_apps().await?;

    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| {
            crate::logger::Log::result("Invalid skipped-app regex", Regex::new(&app.regex)).ok()
        })
        .collect();



    retain_unskipped(&mut logs, &skipped_regexes);

    logs = crate::db::tables::device::filter_logs_by_devices(logs, device_uuids, local_uuid);

    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    let regex = build_regex_table(&categories, &cat_regex)?;
    let app_groups = build_app_group_matchers(&get_app_groups().await?)?;

    logs.extend(
        manual_statistics_logs(day_start, day_end.saturating_add(1), include_manual).await?,
    );

    retain_statistics_categories(&mut logs, category_names.as_deref(), &regex);

    let day_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| log.timestamp >= day_start && log.timestamp <= day_end)
        .collect();
    perf.stage("filter_rules_manual");
    perf.note("day_logs", day_logs.len());

    let mut category_durations: HashMap<String, i64> = HashMap::new();
    let mut category_cache = HashMap::<String, String>::new();
    let mut category_colors: HashMap<String, Option<String>> = HashMap::new();

    for cat in &categories {
        category_colors.insert(cat.name.clone(), cat.color.clone());
    }
    add_manual_category_colors(&mut category_colors).await?;

    for log in &day_logs {
        let category = if is_manual(log) { log_category(log, &regex) } else { derive_category_cached(&log.app, &regex, &mut category_cache) };
        *category_durations.entry(category).or_insert(0) += log.duration;
    }

    let total_time: i64 = category_durations.values().sum();

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

    let app_stats = build_app_stats(&day_logs, &app_groups);
    let top_apps = app_stats.into_iter().take(5).collect();

    let mut hourly_durations: HashMap<i32, i64> = HashMap::new();
    for log in &day_logs {
        let hour = clock.parts(log.timestamp).hour;
        *hourly_durations.entry(hour).or_insert(0) += log.duration;
    }

    let hourly_distribution: Vec<HourlyStat> = (0..=24)
        .map(|hour| HourlyStat {
            hour,
            total_duration: hourly_durations.get(&hour).copied().unwrap_or(0),
        })
        .collect();
    perf.stage("aggregate");
    perf.done();

    Ok(DayStatistics {
        total_time,
        categories: category_stats,
        top_apps,
        hourly_distribution,
    })
}

#[cfg(test)]
#[path = "statistics_baseline.rs"]
mod baseline;

#[cfg(test)]
mod optimization_benchmarks {
    use super::*;
    use std::time::Instant;

    #[tokio::test]
    async fn sql_preaggregation_preserves_local_day_hour_device_and_title() {
        use chrono::{Local, TimeZone};
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        log::create_table(&pool).await.unwrap();
        let start = Local.with_ymd_and_hms(2026,9,28,23,0,0).unwrap().timestamp();
        let samples = [("desktop","Browser",start+10,3,false),("desktop","Browser",start+20,7,false),
            ("desktop","Browser",start+3600,11,false),("desktop","Editor",start+30,13,false),
            ("phone","Browser",start+30,17,false),("desktop","Deleted",start+30,100,true)];
        let mut original = Vec::new();
        for (index,(device,app,timestamp,duration,deleted)) in samples.into_iter().enumerate() {
            sqlx::query("INSERT INTO logs(id,device_uuid,app,timestamp,duration,is_deleted) VALUES(?1,?2,?3,?4,?5,?6)")
                .bind(index as i64).bind(device).bind(app).bind(timestamp).bind(duration).bind(deleted).execute(&pool).await.unwrap();
            if !deleted { original.push(Log { id:index as i64,device_uuid:Some(device.into()),app:app.into(),timestamp,duration,is_deleted:false }); }
        }
        let aggregated = aggregate_statistics_logs_from_pool(&pool).await.unwrap();
        let totals = |logs: &[Log]| {
            let mut result = std::collections::BTreeMap::new();
            for sample in logs {
                *result.entry((sample.device_uuid.clone(),sample.app.clone(),get_day_start(sample.timestamp),get_hour(sample.timestamp))).or_insert(0_i64) += sample.duration;
            }
            result
        };
        assert_eq!(totals(&original),totals(&aggregated));
        assert_eq!(aggregated.len(),4);
        pool.close().await;
    }

    #[tokio::test]
    async fn sql_preaggregation_preserves_toronto_dst_transition_totals() {
        use chrono::{Local, TimeZone};
        // The command uses the machine's local zone. Exercise Toronto's actual
        // gaps/repeated hours when running in an Eastern North American zone.
        let spring_gap = Local.with_ymd_and_hms(2026,3,8,2,30,0);
        let fall_repeat = Local.with_ymd_and_hms(2026,11,1,1,30,0);
        let eastern_offsets = Local.with_ymd_and_hms(2026,1,15,12,0,0).single().unwrap().offset().local_minus_utc() == -5*3600
            && Local.with_ymd_and_hms(2026,7,15,12,0,0).single().unwrap().offset().local_minus_utc() == -4*3600;
        if !eastern_offsets || spring_gap.single().is_some() || fall_repeat.clone().earliest() == fall_repeat.latest() {
            eprintln!("Toronto DST test skipped: OS local timezone does not have Toronto's 2026 transitions");
            return;
        }
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        log::create_table(&pool).await.unwrap();
        let starts = [Local.with_ymd_and_hms(2026,3,8,0,0,0).unwrap().timestamp(),
            Local.with_ymd_and_hms(2026,11,1,0,0,0).unwrap().timestamp()];
        let mut original = Vec::new();
        for (season,start) in starts.into_iter().enumerate() {
            // Eight elapsed hours includes the missing spring hour and both
            // occurrences of autumn's 01:00 hour, using distinct UTC instants.
            for index in 0..32_i64 {
                let timestamp = start + index*900;
                let id = season as i64*100 + index;
                sqlx::query("INSERT INTO logs(id,device_uuid,app,timestamp,duration) VALUES(?1,'desktop','Browser',?2,60)")
                    .bind(id).bind(timestamp).execute(&pool).await.unwrap();
                original.push(Log {id,device_uuid:Some("desktop".into()),app:"Browser".into(),timestamp,duration:60,is_deleted:false});
            }
        }
        let aggregated = aggregate_statistics_logs_from_pool(&pool).await.unwrap();
        let totals = |logs: &[Log]| {
            let mut result = std::collections::BTreeMap::new();
            for sample in logs {
                *result.entry((get_day_start(sample.timestamp),get_hour(sample.timestamp))).or_insert(0_i64) += sample.duration;
            }
            result
        };
        let raw_totals = totals(&original);
        assert_eq!(raw_totals,totals(&aggregated));
        assert!(!raw_totals.contains_key(&(starts[0],2)), "Spring has no local 02:00 hour");
        assert_eq!(raw_totals.get(&(starts[1],1)),Some(&480), "Autumn combines both local 01:00 hours");
        assert_eq!(aggregated.len(),15);
        assert_eq!(aggregated.iter().map(|sample| sample.duration).sum::<i64>(),3840);
        pool.close().await;
    }

    fn canonical(mut value: serde_json::Value) -> serde_json::Value {
        match &mut value {
            serde_json::Value::Array(array) => {
                for item in array.iter_mut() { *item = canonical(item.take()); }
                array.sort_by_cached_key(|item| item.to_string());
            }
            serde_json::Value::Object(map) => {
                for (_, item) in map.iter_mut() { *item = canonical(item.take()); }
            }
            _ => {}
        }
        value
    }

    fn assert_same(old: impl Serialize, new: impl Serialize) {
        let old = canonical(serde_json::to_value(old).unwrap());
        let new = canonical(serde_json::to_value(new).unwrap());
        if old != new {
            let fields: Vec<_> = old.as_object().map(|map| map.keys().filter(|key| old[*key] != new[*key]).cloned().collect()).unwrap_or_default();
            panic!("Statistics parity failed; changed fields: {fields:?}");
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "explicit isolated dev snapshot performance benchmark"]
    async fn benchmark_detailed_range_reuse() {
        assert!(cfg!(debug_assertions));
        assert!(db::get_db_path().to_string_lossy().contains("time-tracker-dev"));
        let now = chrono::Local::now().timestamp();
        BENCHMARK_NOW.store(now, std::sync::atomic::Ordering::Relaxed);
        struct ResetClock;
        impl Drop for ResetClock { fn drop(&mut self) { BENCHMARK_NOW.store(0, std::sync::atomic::Ordering::Relaxed); } }
        let _clock = ResetClock;
        let start = get_statistics_bounds(None).await.unwrap().first_active_day.unwrap();
        let mut before_ms = Vec::new();
        let mut after_ms = Vec::new();
        for _ in 0..3 {
            let timer = Instant::now();
            let old = week_statistics_with_range_reuse(start,now,None,None,false,None).await.unwrap();
            before_ms.push(timer.elapsed().as_secs_f64()*1000.0);
            let timer = Instant::now();
            let new = week_statistics_with_range_reuse(start,now,None,None,true,None).await.unwrap();
            after_ms.push(timer.elapsed().as_secs_f64()*1000.0);
            assert_same(old,new);
        }
        let pool = db::get_pool().await.unwrap();
        let device: String = sqlx::query_scalar("SELECT device_uuid FROM logs WHERE is_deleted=0 LIMIT 1").fetch_one(&pool).await.unwrap();
        for devices in [Some(vec![]),Some(vec![device])] {
            for manual in [Some(false),Some(true)] {
                let old = week_statistics_with_range_reuse(start,now,devices.clone(),manual,false,None).await.unwrap();
                let new = week_statistics_with_range_reuse(start,now,devices.clone(),manual,true,None).await.unwrap();
                assert_same(old,new);
            }
        }
        let report = serde_json::json!({"scope":"Same full-history Detailed query before and after shared range read; same optimized dev profile and fixed clock",
            "range_days":(now-start)/86400,"before_ms":before_ms,"after_ms":after_ms,"full_output_parity":true,"filtered_device_and_manual_parity":true});
        let output = std::env::var("TT_DETAILED_BENCHMARK_OUTPUT").unwrap_or_else(|_| "detailed-query-benchmark.local.json".into());
        std::fs::write(output,serde_json::to_vec_pretty(&report).unwrap()).unwrap();
        println!("DETAILED_QUERY_BENCHMARK={report}");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "explicit isolated dev snapshot performance benchmark"]
    async fn benchmark_statistics_snapshot() {
        assert!(cfg!(debug_assertions), "Never benchmark the release production instance");
        let path = db::get_db_path();
        assert!(path.to_string_lossy().contains("time-tracker-dev"), "Dev database required: {}", path.display());
        assert!(path.exists(), "Launch isolated dev app first to create snapshot");
        let now = chrono::Local::now().timestamp();
        // Previous-period clipping moves with wall time even on an immutable DB.
        // Both implementations must compare against exactly the same instant.
        BENCHMARK_NOW.store(now, std::sync::atomic::Ordering::Relaxed);
        struct ResetClock;
        impl Drop for ResetClock { fn drop(&mut self) { BENCHMARK_NOW.store(0, std::sync::atomic::Ordering::Relaxed); } }
        let _clock = ResetClock;
        let end = get_week_start(now) + 7 * 86400 - 1;
        let start = end - 7 * 86400 + 1;
        let mut report = serde_json::Map::new();
        // These cases are easy to accidentally change when replacing full reads
        // with SQL ranges: empty devices still include manual blocks, current
        // periods respect now, and manual disabling affects every shared total.
        let pool = db::get_pool().await.unwrap();
        let device: Option<String> = sqlx::query_scalar("SELECT device_uuid FROM logs WHERE is_deleted=0 LIMIT 1").fetch_optional(&pool).await.unwrap();
        for devices in [Some(Vec::new()), device.map(|device| vec![device])] {
            for include_manual in [Some(false), Some(true)] {
                let old = baseline::get_week_statistics(start + 1777,end - 999,devices.clone(),include_manual).await.unwrap();
                let new = get_week_statistics(start + 1777,end - 999,devices.clone(),include_manual,None).await.unwrap();
                assert_same(old,new);
            }
        }
        for (name, range_start, range_end) in [("weekly",start,end),("range_24_weeks",start-23*7*86400,end)] {
            let mut old_ms = Vec::new();
            let mut new_ms = Vec::new();
            for _ in 0..3 {
                let timer = Instant::now();
                let old = baseline::get_week_statistics(range_start,range_end,None,None).await.unwrap();
                old_ms.push(timer.elapsed().as_secs_f64()*1000.0);
                let timer = Instant::now();
                let new = get_week_statistics(range_start,range_end,None,None,None).await.unwrap();
                new_ms.push(timer.elapsed().as_secs_f64()*1000.0);
                assert_same(old,new);
            }
            report.insert(name.into(), serde_json::json!({"baseline_ms":old_ms,"optimized_ms":new_ms}));
        }
        let mut old_ms = Vec::new();
        let mut new_ms = Vec::new();
        for _ in 0..3 {
            let timer = Instant::now();
            let old = baseline::get_total_statistics(None).await.unwrap();
            old_ms.push(timer.elapsed().as_secs_f64()*1000.0);
            let timer = Instant::now();
            let new = get_total_statistics(None).await.unwrap();
            new_ms.push(timer.elapsed().as_secs_f64()*1000.0);
            assert_same(&old,&new);
            let bounds = get_statistics_bounds(None).await.unwrap();
            assert_eq!(bounds.first_active_day,new.first_active_day);
            assert_eq!(bounds.total_time_all_time,new.total_time_all_time);
        }
        let no_manual = get_total_statistics(Some(false)).await.unwrap();
        assert_same(baseline::get_total_statistics(Some(false)).await.unwrap(), &no_manual);
        let bounds = get_statistics_bounds(Some(false)).await.unwrap();
        assert_eq!(bounds.first_active_day,no_manual.first_active_day);
        assert_eq!(bounds.total_time_all_time,no_manual.total_time_all_time);
        report.insert("all_time".into(),serde_json::json!({"baseline_ms":old_ms,"optimized_ms":new_ms}));
        let weeks: Vec<StatisticsRange> = (0..24).map(|index| StatisticsRange {week_start:start-index*7*86400,week_end:end-index*7*86400}).collect();
        let mut old_ms = Vec::new();
        let mut new_ms = Vec::new();
        let mut old_bytes = 0;
        let mut new_bytes = 0;
        for _ in 0..3 {
            let timer = Instant::now();
            let tasks: Vec<_> = weeks.iter().map(|week| {
                let (start,end) = (week.week_start,week.week_end);
                tokio::spawn(async move {baseline::get_week_statistics(start,end,None,None).await.unwrap()})
            }).collect();
            let mut old = Vec::new();
            for task in tasks { old.push(task.await.unwrap()); }
            old_ms.push(timer.elapsed().as_secs_f64()*1000.0);
            let timer = Instant::now();
            let new = get_trend_statistics(weeks.clone(),None,None).await.unwrap();
            new_ms.push(timer.elapsed().as_secs_f64()*1000.0);
            old_bytes = serde_json::to_vec(&old).unwrap().len();
            new_bytes = serde_json::to_vec(&new).unwrap().len();
            for (old,new) in old.iter().zip(new.iter()) {
                assert_eq!(old.total_time,new.total_time);
                let mut old_categories = serde_json::to_value(&old.categories).unwrap();
                let mut old_apps = serde_json::to_value(&old.all_apps).unwrap();
                for stat in old_categories.as_array_mut().unwrap().iter_mut().chain(old_apps.as_array_mut().unwrap().iter_mut()) {stat["percentage_change"] = serde_json::Value::Null;}
                assert_same(old_categories,&new.categories);
                assert_same(old_apps,&new.all_apps);
            }
        }
        report.insert("trend_24_weeks".into(),serde_json::json!({"baseline_ms":old_ms,"optimized_ms":new_ms,"baseline_bytes":old_bytes,"optimized_bytes":new_bytes}));
        println!("STATISTICS_BENCHMARK={}",serde_json::Value::Object(report.clone()));
        let output = std::env::var("TT_BENCHMARK_OUTPUT").unwrap_or_else(|_| "statistics-benchmark.json".into());
        std::fs::write(output,serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    }
}

#[cfg(test)]
mod category_matcher_tests {
    use super::*;

    fn category(id: i32, name: &str, priority: i32) -> Category {
        Category {id,name:name.into(),priority,color:None,regex_enabled:true,is_visible:true,in_stats:true,is_collapsed:false}
    }

    fn pattern(id: i32, cat_id: i32, regex: &str) -> CategoryRegex {
        CategoryRegex {id,cat_id,regex:regex.into()}
    }

    #[test]
    fn cached_matchers_preserve_priority_stable_ties_and_individual_match_semantics() {
        let categories = [category(1,"Low",0),category(2,"First tie",10),category(3,"Second tie",10),category(4,"Unicode",20)];
        let patterns = [pattern(1,1,"(?s).*"),pattern(2,2,"(?i)browser|editor"),pattern(3,3,"^Browser"),
            pattern(4,4,"(?i)café|東京"),pattern(5,2,"(?m)^second$"),pattern(6,3,r"\bcode\b")];
        let compiled = build_regex_table(&categories,&patterns).unwrap();
        for (title,expected) in [("Browser","First tie"),("browser","First tie"),("Editor - café","Unicode"),("東京 Browser","Unicode"),
            ("CODE","Low"),("code","Second tie"),("first\nsecond","First tie"),("unmatched","Low"),("","Low")] {
            assert_eq!(derive_category(title,&compiled),expected,"title={title:?}");
        }
        assert_eq!(derive_category("Browser",&compiled),"First tie");
        assert_eq!(derive_category("東京 Browser",&compiled),"Unicode");
        assert_eq!(derive_category("anything",&[]),"Miscellaneous");
    }

    #[test]
    fn matcher_cache_tracks_renames_priorities_and_rule_order_and_preserves_errors() {
        let mut categories = [category(101,"First",10),category(102,"Second",10)];
        let mut patterns = [pattern(101,101,"hit"),pattern(102,102,"hit")];
        assert_eq!(derive_category("hit",&build_regex_table(&categories,&patterns).unwrap()),"First");
        patterns.swap(0,1);
        assert_eq!(derive_category("hit",&build_regex_table(&categories,&patterns).unwrap()),"Second");
        categories[0].priority = 20;
        categories[0].name = "Renamed".into();
        assert_eq!(derive_category("hit",&build_regex_table(&categories,&patterns).unwrap()),"Renamed");
        patterns[1].regex = "different".into();
        assert_eq!(derive_category("hit",&build_regex_table(&categories,&patterns).unwrap()),"Second");
        assert!(build_regex_table(&categories,&[pattern(1,101,"(")]).is_err());
        assert!(build_regex_table(&categories,&[pattern(1,999,"valid")]).is_err());
    }
}

#[cfg(test)]
mod app_group_statistics_tests {
    use super::*;
    use crate::db::tables::app_group::{build_app_group_matchers, AppGroup};

    #[test]
    fn changing_window_titles_can_reach_top_apps_as_one_group() {
        let matchers = build_app_group_matchers(&[AppGroup {
            id: 1,
            name: "YouTube".into(),
            regex: "(?i)youtube".into(),
        }])
        .unwrap();

        let mut logs: Vec<Log> = (0..6)
            .map(|index| Log {
                id: index,
                device_uuid: Some("desktop".into()),
                app: format!("Video {index} - YouTube - Vivaldi"),
                timestamp: 100 + index,
                duration: 10,
                is_deleted: false,
            })
            .collect();
        logs.push(Log {
            id: 10,
            device_uuid: Some("desktop".into()),
            app: "Visual Studio Code".into(),
            timestamp: 200,
            duration: 50,
            is_deleted: false,
        });

        let stats = build_app_stats(&logs, &matchers);
        assert_eq!(stats[0].app, "YouTube");
        assert_eq!(stats[0].total_duration, 60);
        assert_eq!(stats[0].app_names.len(), 6);
    }
}

#[cfg(test)]
mod manual_statistics_tests {
    use super::*;
    use crate::db::tables::manual_time_block::ManualTimeBlock;
    use chrono::{Local, TimeZone};

    #[test]
    fn manual_blocks_clip_split_and_count_overlaps_independently() {
        let start = Local
            .with_ymd_and_hms(2026, 9, 28, 23, 30, 0)
            .unwrap()
            .timestamp();
        let block = ManualTimeBlock {
            id: 1,
            title: "Planning".into(),
            notes: Some("Keep notes".into()),
            project_id: None,
            project_name: None,
            start_time: start,
            end_time: start + 7200,
            created_at: start,
            updated_at: start,
        };
        let blocks = [block.clone(), block.clone()];
        let logs = manual_segments(&blocks, start + 900, start + 6300);
        assert_eq!(logs.iter().map(|l| l.duration).sum::<i64>(), 10800);
        assert_eq!(logs.len(), 6);
        assert_eq!(logs[0].timestamp, start + 900);
        assert_eq!(logs[0].duration, 900);
        assert_eq!(
            get_day_start(logs[1].timestamp) - get_day_start(logs[0].timestamp),
            86400
        );
        assert!(logs.iter().all(|l| log_category(l, &[]) == MANUAL_CATEGORY));
        let stats = build_app_stats(&logs, &[]);
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].total_duration, 10800);
        assert!(stats[0].app_names.is_empty());
        assert_eq!(block.notes.as_deref(), Some("Keep notes"));
        assert!(manual_segments(&blocks, start + 7200, start + 8000).is_empty());
        let mut project_block = block.clone();
        project_block.project_id = Some(1);
        project_block.project_name = Some("Client work".into());
        let project_logs = manual_segments(&[project_block], start, start + 7200);
        assert_eq!(project_logs.iter().map(|log| log.duration).sum::<i64>(), 7200);
        assert!(project_logs.iter().all(|log| is_manual(log) && log_category(log, &[]) == "Client work"));
    }
}
