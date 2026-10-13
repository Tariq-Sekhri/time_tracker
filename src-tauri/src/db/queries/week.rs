use crate::db;
use crate::db::error::Error;
use crate::db::tables::app_group::{
    build_app_group_matchers, get_app_groups, resolve_app_group, CachedAppGroup,
};
use crate::db::tables::cat_regex::{get_cat_regex, CategoryRegex};
use crate::db::tables::category::{get_categories, Category};
use crate::db::tables::log::{clean_skipped_logs, get_logs_in_time_range, Log};
use crate::db::tables::settings::get_settings;
use crate::db::tables::skipped_app::get_skipped_apps;

use chrono::{Datelike, Duration, Local, NaiveDateTime, TimeZone, Timelike};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TimeBlockLogs {
    pub app: String,
    pub app_names: Vec<String>,
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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimeBlockSettings {
    pub min_log_duration: i64,
    pub max_attach_distance: i64,
    pub lookahead_window: i64,
    pub min_duration: i64,
}

impl TimeBlock {
    fn new(log: &Log, id: i32, log_cat: String, app_groups: &[CachedAppGroup]) -> Self {
        TimeBlock {
            id,
            category: log_cat,
            start_time: log.timestamp,
            apps: vec![TimeBlockLogs {
                app: resolve_app_group(&log.app, app_groups).to_string(),
                app_names: vec![log.app.clone()],
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
                for app_name in other_app.app_names {
                    if !existing_app.app_names.contains(&app_name) {
                        existing_app.app_names.push(app_name);
                    }
                }
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

fn derive_category(app: &str, regexes: &[CachedCategoryRegex]) -> Result<String, Error> {
    if regexes.is_empty() {
        return Ok("Miscellaneous".to_string());
    }

    regexes
        .iter()
        .find(|regex| regex.regex.is_match(app))
        .map(|regex| regex.category.clone())
        .ok_or_else(|| anyhow::anyhow!("Derive Category Error").into())
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
                .ok_or_else(|| anyhow::anyhow!("Error creating regex: category not found"))?;

            let compiled_regex = Regex::new(&reg.regex)?;

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

fn get_time_blocks(
    logs: &[Log],
    regex: &[CachedCategoryRegex],
    app_groups: &[CachedAppGroup],
    time_block_settings: &TimeBlockSettings,
) -> Result<Vec<TimeBlock>, Error> {
    if logs.is_empty() {
        return Ok(Vec::new());
    }

    let mut ordered_logs: Vec<&Log> = logs.iter().collect();
    ordered_logs.sort_by(|a, b| a.timestamp.cmp(&b.timestamp).then(a.id.cmp(&b.id)));

    let min_log_duration = time_block_settings.min_log_duration.max(1);

    let long_logs: Vec<&Log> = ordered_logs
        .iter()
        .copied()
        .filter(|log| log.duration >= min_log_duration)
        .collect();
    let short_logs: Vec<&Log> = ordered_logs
        .iter()
        .copied()
        .filter(|log| log.duration < min_log_duration)
        .collect();

    if long_logs.is_empty() {
        return Ok(Vec::new());
    }

    let mut time_blocks: Vec<TimeBlock> = Vec::new();
    let first = long_logs[0];
    time_blocks.push(TimeBlock::new(
        first,
        0,
        derive_category(&first.app, regex)?,
        app_groups,
    ));

    let mut time_block_index = 0;
    for log in &long_logs[1..] {
        let log_cat = derive_category(&log.app, regex)?;
        let log_end_time = log.timestamp + log.duration;

        if let Some(current_time_block) = time_blocks.get_mut(time_block_index) {
            if current_time_block.category == log_cat {
                if log.timestamp <= current_time_block.end_time {
                    current_time_block.start_time =
                        current_time_block.start_time.min(log.timestamp);
                    current_time_block.end_time = current_time_block.end_time.max(log_end_time);
                    let grouped_app = resolve_app_group(&log.app, app_groups);
                    if let Some(matching_app) = current_time_block
                        .apps
                        .iter_mut()
                        .find(|s| s.app == grouped_app)
                    {
                        matching_app.total_duration += log.duration;
                        if !matching_app.app_names.contains(&log.app) {
                            matching_app.app_names.push(log.app.clone());
                        }
                    } else {
                        current_time_block.apps.push(TimeBlockLogs {
                            app: grouped_app.to_string(),
                            app_names: vec![log.app.clone()],
                            total_duration: log.duration,
                        })
                    }
                } else {
                    time_block_index += 1;
                    time_blocks.push(TimeBlock::new(
                        log,
                        time_block_index as i32,
                        log_cat,
                        app_groups,
                    ));
                }
            } else {
                time_block_index += 1;
                time_blocks.push(TimeBlock::new(
                    log,
                    time_block_index as i32,
                    log_cat,
                    app_groups,
                ));
            }
        }
    }

    let max_attach_distance = time_block_settings.max_attach_distance.max(0);

    for short_log in short_logs {
        if time_blocks.is_empty() {
            break;
        }

        let short_log_cat = derive_category(&short_log.app, regex)?;

        let mut best_match: Option<usize> = None;
        let mut min_distance = i64::MAX;

        for (idx, block) in time_blocks.iter().enumerate() {
            if block.category != short_log_cat {
                continue;
            }

            let distance = if short_log.timestamp < block.start_time {
                block.start_time - short_log.timestamp
            } else if short_log.timestamp > block.end_time {
                short_log.timestamp - block.end_time
            } else {
                0 // Log is within the block's time range
            };

            if distance <= max_attach_distance && distance < min_distance {
                min_distance = distance;
                best_match = Some(idx);
            }
        }

        if let Some(idx) = best_match {
            if let Some(block) = time_blocks.get_mut(idx) {
                let grouped_app = resolve_app_group(&short_log.app, app_groups);
                if let Some(matching_app) = block.apps.iter_mut().find(|a| a.app == grouped_app) {
                    matching_app.total_duration += short_log.duration;
                    if !matching_app.app_names.contains(&short_log.app) {
                        matching_app.app_names.push(short_log.app.clone());
                    }
                } else {
                    block.apps.push(TimeBlockLogs {
                        app: grouped_app.to_string(),
                        app_names: vec![short_log.app.clone()],
                        total_duration: short_log.duration,
                    });
                }
            }
        }
    }

    Ok(time_blocks)
}

#[derive(Serialize, Debug, PartialEq)]
pub struct AfkDisplayBlock {
    pub device: String,
    pub start: i64,
    pub end: i64,
}

pub(crate) fn afk_display_blocks(
    intervals: &[crate::afk::storage::Interval],
    start: i64,
    end: i64,
    settings: &TimeBlockSettings,
) -> Result<Vec<AfkDisplayBlock>, Error> {
    let mut devices = std::collections::BTreeMap::<String, Vec<(i64,i64)>>::new();
    for interval in intervals.iter().filter(|i| i.state==2 && i.start_time<end && i.end_time>start) {
        devices.entry(interval.device_uuid.clone()).or_default().push((interval.start_time.max(start),interval.end_time.min(end)));
    }
    let mut result=Vec::new();
    for (device,spans) in devices {
        // Evidence mask changes can split one continuous away period into rows.
        let logs=merge_spans(spans).into_iter().enumerate().map(|(id,(start,end))| Log {
            id:id as i64, device_uuid:Some(device.clone()),app:"AFK".into(),timestamp:start,duration:end-start,is_deleted:false,
        }).collect::<Vec<_>>();
        let blocks=transform_time_blocks(get_time_blocks(&logs,&[],&[],settings)?,settings)?;
        result.extend(blocks.into_iter().map(|block| AfkDisplayBlock {device:device.clone(),start:block.start_time,end:block.end_time}));
    }
    Ok(result)
}

fn setting_val(rows: &HashMap<String, i32>, key: &str, default: i32) -> i64 {
    rows.get(key).copied().unwrap_or(default) as i64
}

async fn load_runtime_settings() -> Result<(i64, TimeBlockSettings), Error> {
    let settings = get_settings().await?;
    let rows: HashMap<String, i32> = settings.into_iter().map(|s| (s.key, s.val)).collect();
    let calendar_start_hour = setting_val(&rows, "calendarStartHour", 8).clamp(0, 23);
    let time_block_settings = TimeBlockSettings {
        min_log_duration: setting_val(&rows, "minLogDuration", 1).max(1),
        max_attach_distance: setting_val(&rows, "maxAttachDistance", 400).max(0),
        lookahead_window: setting_val(&rows, "lookaheadWindow", 500).max(0),
        min_duration: setting_val(&rows, "minDuration", 300).max(1),
    };
    Ok((calendar_start_hour, time_block_settings))
}

fn local_timestamp(naive: NaiveDateTime) -> i64 {
    // A wall-clock time can be skipped by a DST jump; fall back to the hour after it.
    naive
        .and_local_timezone(Local)
        .earliest()
        .or_else(|| {
            (naive + Duration::hours(1))
                .and_local_timezone(Local)
                .earliest()
        })
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|| naive.and_utc().timestamp())
}

// Week bounds must use local time: the calendar UI draws days from calendarStartHour
// local, so UTC bounds cut off the last (or first) hours of the week by the UTC offset.
fn week_bounds_from_anchor(anchor_unix: i64, calendar_start_hour: i64) -> (i64, i64) {
    let dt = Local
        .timestamp_opt(anchor_unix, 0)
        .single()
        .unwrap_or_else(Local::now);
    let start_of_day = if dt.hour() as i64 >= calendar_start_hour {
        dt.date_naive()
            .and_hms_opt(calendar_start_hour as u32, 0, 0)
            .unwrap()
    } else {
        (dt.date_naive() - Duration::days(1))
            .and_hms_opt(calendar_start_hour as u32, 0, 0)
            .unwrap()
    };
    let weekday = start_of_day.weekday().num_days_from_monday() as i64;
    let week_start = start_of_day - Duration::days(weekday);
    let next_week_start = week_start + Duration::days(7);
    (
        local_timestamp(week_start),
        local_timestamp(next_week_start) - 1,
    )
}

#[tauri::command]
pub async fn get_week(
    week_anchor: i64,
    device_uuids: Option<Vec<String>>,
) -> Result<Vec<TimeBlock>, Error> {
    let mut perf = crate::perf::Perf::new("get_week");
    let (calendar_start_hour, time_block_settings) = load_runtime_settings().await?;
    let (week_start, week_end) = week_bounds_from_anchor(week_anchor, calendar_start_hour);
    let local_uuid = crate::db::tables::device::get_local_log_device_uuid().await?;
    perf.stage("settings");
    let mut logs = get_logs_in_time_range(week_start, week_end).await?;
    perf.stage("get_logs");
    perf.note("all_logs", logs.len());
    let skipped_apps = get_skipped_apps().await?;

    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| {
            crate::logger::Log::result("Invalid skipped-app regex", Regex::new(&app.regex)).ok()
        })
        .collect();

    let is_skipped =
        |app_name: &str| -> bool { skipped_regexes.iter().any(|regex| regex.is_match(app_name)) };

    // Calendar filters are read-only. Skipped titles are hidden below without
    // marking original activity deleted merely because a view was opened.

    logs.retain(|log| !is_skipped(&log.app));

    logs = crate::db::tables::device::filter_logs_by_devices(logs, device_uuids, local_uuid);
    perf.stage("filter");

    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    let regex = build_regex_table(&categories, &cat_regex)?;
    let app_groups = build_app_group_matchers(&get_app_groups().await?)?;
    perf.stage("rules");

    let logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| log.timestamp >= week_start && log.timestamp <= week_end)
        .collect();
    perf.stage("week_filter");
    perf.note("week_logs", logs.len());

    if logs.is_empty() {
        perf.done();
        return Ok(Vec::new());
    }

    let blocks = get_time_blocks(&logs, &regex, &app_groups, &time_block_settings)?;
    perf.stage("build_blocks");
    perf.note("raw_blocks", blocks.len());
    let blocks = transform_time_blocks(blocks, &time_block_settings)?;
    perf.stage("merge_blocks");
    perf.note("blocks", blocks.len());
    perf.done();
    Ok(blocks)
}

#[tauri::command]
pub async fn get_week_for_app_filter(
    week_anchor: i64,
    app_name: String,
    device_uuids: Option<Vec<String>>,
) -> Result<Vec<TimeBlock>, Error> {
    let mut perf = crate::perf::Perf::new("get_week_for_app_filter");
    let (calendar_start_hour, time_block_settings) = load_runtime_settings().await?;
    let (week_start, week_end) = week_bounds_from_anchor(week_anchor, calendar_start_hour);
    let local_uuid = crate::db::tables::device::get_local_log_device_uuid().await?;
    perf.stage("settings");
    let mut logs = get_logs_in_time_range(week_start, week_end).await?;
    perf.stage("get_logs");
    perf.note("all_logs", logs.len());
    let skipped_apps = get_skipped_apps().await?;

    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|app| {
            crate::logger::Log::result("Invalid skipped-app regex", Regex::new(&app.regex)).ok()
        })
        .collect();

    let is_skipped =
        |app: &str| -> bool { skipped_regexes.iter().any(|regex| regex.is_match(app)) };

    logs.retain(|log| !is_skipped(&log.app));

    logs = crate::db::tables::device::filter_logs_by_devices(logs, device_uuids, local_uuid);
    perf.stage("filter");

    let cat_regex = get_cat_regex().await?;
    let categories = get_categories().await?;
    let regex = build_regex_table(&categories, &cat_regex)?;
    let app_groups = build_app_group_matchers(&get_app_groups().await?)?;
    perf.stage("rules");

    let logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| {
            resolve_app_group(&log.app, &app_groups) == app_name
                && log.timestamp >= week_start
                && log.timestamp <= week_end
        })
        .collect();
    perf.stage("week_filter");
    perf.note("week_logs", logs.len());

    if logs.is_empty() {
        perf.done();
        return Ok(Vec::new());
    }

    let blocks = get_time_blocks(&logs, &regex, &app_groups, &time_block_settings)?;
    perf.stage("build_blocks");
    let blocks = transform_time_blocks(blocks, &time_block_settings)?;
    perf.stage("merge_blocks");
    perf.note("blocks", blocks.len());
    perf.done();
    Ok(blocks)
}

fn merge_spans(mut spans: Vec<(i64,i64)>) -> Vec<(i64,i64)> {
    spans.sort_unstable(); let mut result=Vec::<(i64,i64)>::new();
    for (start,end) in spans {
        if let Some(previous)=result.last_mut() {if previous.1>=start {previous.1=previous.1.max(end);continue;}}
        result.push((start,end));
    } result
}

#[cfg(test)]
mod afk_calendar_tests {
    use super::*;
    #[test]
    fn hundreds_of_fragmented_afk_rows_merge_into_three_device_scoped_blocks() {
        let mut evidence=Vec::new();
        for (base,count,device) in [(1000,200,"a"),(20000,200,"a"),(40000,188,"b")] {
            for i in 0..count {
                evidence.push(crate::afk::storage::Interval {
                    device_uuid:device.into(),start_time:base+i*3,end_time:base+i*3+2,
                    state:2,known_mask:1,active_mask:0,settings_id:1,
                });
            }
        }
        let settings=TimeBlockSettings{min_log_duration:1,max_attach_distance:400,lookahead_window:500,min_duration:300};
        let blocks=afk_display_blocks(&evidence,0,50000,&settings).unwrap();
        assert_eq!(evidence.len(),588);
        assert_eq!(blocks.len(),3);
        assert_eq!(blocks.iter().map(|b|b.device.as_str()).collect::<Vec<_>>(),vec!["a","a","b"]);
    }

    #[tokio::test]
    #[ignore = "Explicit read-only check of the isolated development snapshot"]
    async fn afk_snapshot_grouping_probe() {
        let path=std::path::PathBuf::from(std::env::var("APPDATA").unwrap()).join("time-tracker-dev/apptest.db");
        let options=sqlx::sqlite::SqliteConnectOptions::new().filename(path).read_only(true);
        let pool=sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect_with(options).await.unwrap();
        let evidence=sqlx::query_as::<_,crate::afk::storage::Interval>("SELECT device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id FROM afk_intervals WHERE state=2 ORDER BY device_uuid,start_time").fetch_all(&pool).await.unwrap();
        let rows=sqlx::query_as::<_,(String,i64)>("SELECT key,val FROM settings WHERE key IN ('minLogDuration','maxAttachDistance','lookaheadWindow','minDuration')").fetch_all(&pool).await.unwrap().into_iter().collect::<HashMap<_,_>>();
        let settings=TimeBlockSettings{min_log_duration:rows["minLogDuration"],max_attach_distance:rows["maxAttachDistance"],lookahead_window:rows["lookaheadWindow"],min_duration:rows["minDuration"]};
        let blocks=afk_display_blocks(&evidence,0,i64::MAX,&settings).unwrap();
        println!("AFK snapshot: {} evidence rows -> {} visible merged blocks",evidence.len(),blocks.len());
        assert!(!blocks.is_empty());assert!(blocks.len()<evidence.len());
        pool.close().await;
    }
    #[test]
    fn afk_display_uses_shared_rules_without_combining_devices_or_hiding_present_gaps() {
        let interval=|device:&str,start,end| crate::afk::storage::Interval {
            device_uuid:device.into(),start_time:start,end_time:end,state:2,known_mask:1,active_mask:0,settings_id:1,
        };
        let evidence=vec![interval("a",100,110),interval("a",120,130),interval("b",115,125)];
        let mut settings=TimeBlockSettings {min_log_duration:1,max_attach_distance:10,lookahead_window:10,min_duration:20};
        assert_eq!(afk_display_blocks(&evidence,0,200,&settings).unwrap(),vec![AfkDisplayBlock{device:"a".into(),start:100,end:130}]);
        // Minimum duration counts observed away seconds, not the intervening gap.
        settings.min_duration=25;
        assert!(afk_display_blocks(&evidence,0,200,&settings).unwrap().is_empty());
        settings.min_duration=1;settings.lookahead_window=9;
        assert_eq!(afk_display_blocks(&evidence,0,200,&settings).unwrap().len(),3);
        let log=Log{id:1,device_uuid:Some("a".into()),app:"Editor".into(),timestamp:100,duration:30,is_deleted:false};
        let filtered=crate::afk::storage::subtract(vec![log],&evidence);
        assert_eq!((filtered[0].timestamp,filtered[0].duration),(110,10));
    }

    #[test]
    fn afk_display_attaches_short_evidence_using_activity_thresholds() {
        let evidence=vec![
            crate::afk::storage::Interval{device_uuid:"a".into(),start_time:100,end_time:160,state:2,known_mask:1,active_mask:0,settings_id:1},
            crate::afk::storage::Interval{device_uuid:"a".into(),start_time:165,end_time:170,state:2,known_mask:1,active_mask:0,settings_id:1},
        ];
        let mut settings=TimeBlockSettings{min_log_duration:10,max_attach_distance:5,lookahead_window:10,min_duration:65};
        assert_eq!(afk_display_blocks(&evidence,0,200,&settings).unwrap().len(),1);
        settings.max_attach_distance=4;
        assert!(afk_display_blocks(&evidence,0,200,&settings).unwrap().is_empty());
    }
    #[test]
    fn excluding_afk_preserves_gap_merging_and_short_sample_attachment() {
        let sample=|device:&str,start,duration|Log {id:1,device_uuid:Some(device.into()),app:"Movie".into(),timestamp:start,duration,is_deleted:false};
        let logs=vec![sample("a",100,100),sample("a",210,5)];
        let evidence=vec![crate::afk::storage::Interval {device_uuid:"a".into(),start_time:120,end_time:180,state:2,known_mask:1,active_mask:0,settings_id:1}];
        let filtered=crate::afk::storage::subtract(logs,&evidence);
        let settings=TimeBlockSettings{min_log_duration:10,max_attach_distance:10,lookahead_window:60,min_duration:45};
        let blocks=transform_time_blocks(get_time_blocks(&filtered,&[],&[],&settings).unwrap(),&settings).unwrap();
        assert_eq!(blocks.len(),1);
        assert_eq!((blocks[0].start_time,blocks[0].end_time),(100,200));
        assert_eq!(blocks[0].apps[0].total_duration,45);
    }

    #[test]
    fn another_devices_afk_does_not_change_activity_blocks_or_durations() {
        let sample=|device:&str,start,duration|Log{id:1,device_uuid:Some(device.into()),app:"Editor".into(),timestamp:start,duration,is_deleted:false};
        let phone=vec![sample("b",100,20),sample("b",180,20),sample("b",205,5)];
        let mut combined=phone.clone();combined.push(sample("a",120,60));
        let evidence=vec![crate::afk::storage::Interval{device_uuid:"a".into(),start_time:120,end_time:180,state:2,known_mask:1,active_mask:0,settings_id:1}];
        let settings=TimeBlockSettings{min_log_duration:10,max_attach_distance:5,lookahead_window:60,min_duration:45};
        let expected=transform_time_blocks(get_time_blocks(&phone,&[],&[],&settings).unwrap(),&settings).unwrap();
        let filtered=crate::afk::storage::subtract(combined,&evidence);
        let actual=transform_time_blocks(get_time_blocks(&filtered,&[],&[],&settings).unwrap(),&settings).unwrap();
        assert_eq!(actual,expected);
        assert_eq!(actual.len(),1);
        assert_eq!(actual[0].apps[0].total_duration,45);
    }
}

fn ensure_non_overlapping(mut blocks: Vec<TimeBlock>) -> Vec<TimeBlock> {
    if blocks.is_empty() {
        return blocks;
    }

    blocks.sort_by_key(|b| b.start_time);

    let mut result = Vec::new();
    let mut current = blocks[0].clone();

    for next in blocks.into_iter().skip(1) {
        if next.start_time <= current.end_time && next.category == current.category {
            current.end_time = current.end_time.max(next.end_time);

            for next_app in next.apps {
                if let Some(existing_app) = current.apps.iter_mut().find(|a| a.app == next_app.app)
                {
                    existing_app.total_duration += next_app.total_duration;
                    for app_name in next_app.app_names {
                        if !existing_app.app_names.contains(&app_name) {
                            existing_app.app_names.push(app_name);
                        }
                    }
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

fn transform_time_blocks(
    time_blocks: Vec<TimeBlock>,
    time_block_settings: &TimeBlockSettings,
) -> Result<Vec<TimeBlock>, Error> {
    let lookahead_window = time_block_settings.lookahead_window.max(0);
    let min_duration = time_block_settings.min_duration.max(1);

    if time_blocks.is_empty() {
        return Ok(Vec::new());
    }

    let mut result: Vec<TimeBlock> = time_blocks;
    result.sort_by_key(|b| b.start_time);
    let mut to_remove = std::collections::HashSet::new();

    for i in 0..result.len() {
        if to_remove.contains(&i) {
            continue;
        }

        let current_category = result[i].category.clone();

        for j in (i + 1)..result.len() {
            if to_remove.contains(&j) {
                continue;
            }

            // Blocks are sorted by start. Once this gap is too large, every
            // later block is also out of reach; scanning/cloning them is wasted.
            let future_start = result[j].start_time;
            if future_start - result[i].end_time > lookahead_window {
                break;
            }
            if result[j].category == current_category {
                let future_end = result[j].end_time;
                let future_apps = result[j].apps.clone();
                let current_end = result[i].end_time;
                let gap = future_start - current_end;

                if gap <= lookahead_window {
                    result[i].end_time = future_end.max(current_end);

                    if future_start < result[i].start_time {
                        result[i].start_time = future_start;
                    }

                    for future_app in future_apps {
                        if let Some(existing_app) =
                            result[i].apps.iter_mut().find(|a| a.app == future_app.app)
                        {
                            existing_app.total_duration += future_app.total_duration;
                            for app_name in future_app.app_names {
                                if !existing_app.app_names.contains(&app_name) {
                                    existing_app.app_names.push(app_name);
                                }
                            }
                        } else {
                            result[i].apps.push(future_app);
                        }
                    }

                    to_remove.insert(j);
                }
            }
        }
    }

    let mut indices_to_remove: Vec<usize> = to_remove.into_iter().collect();
    indices_to_remove.sort_unstable();
    indices_to_remove.reverse();

    for idx in indices_to_remove {
        result.remove(idx);
    }

    let result: Vec<TimeBlock> = result
        .into_iter()
        .filter(|block| {
            let duration: i64 = block.apps.iter().map(|log| log.total_duration).sum();
            duration >= min_duration
        })
        .collect();

    Ok(result)
}

#[cfg(test)]
#[path = "week_legacy_perf.rs"]
mod legacy_perf;

#[cfg(test)]
mod calendar_performance_tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn merge_window_pruning_matches_legacy_on_overlaps_and_chains() {
        let mut seed = 17u64;
        for case in 0..200 {
            let settings = TimeBlockSettings {
                min_log_duration: 1,
                max_attach_distance: 400,
                lookahead_window: case % 13,
                min_duration: case % 17 + 1,
            };
            let mut start = 0;
            let mut blocks = Vec::new();
            for id in 0..100 {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                start += (seed % 25) as i64;
                let duration = ((seed >> 12) % 80) as i64;
                blocks.push(TimeBlock {
                    id,
                    category: format!("category{}", (seed >> 32) % 4),
                    apps: vec![TimeBlockLogs {
                        app: "app".into(),
                        app_names: vec!["title".into()],
                        total_duration: duration,
                    }],
                    start_time: start,
                    end_time: start + duration,
                });
            }
            let expected = legacy_perf::transform_time_blocks(
                // The frozen implementation uses its own equivalent struct type.
                serde_json::from_value(serde_json::to_value(&blocks).unwrap()).unwrap(),
                &serde_json::from_value(serde_json::to_value(&settings).unwrap()).unwrap(),
            )
            .unwrap();
            assert_eq!(
                serde_json::to_value(transform_time_blocks(blocks, &settings).unwrap()).unwrap(),
                serde_json::to_value(expected).unwrap(),
                "Merge parity in case {case}"
            );
        }
    }

    #[tokio::test]
    #[ignore = "Requires the isolated debug snapshot populated by npm start"]
    async fn calendar_snapshot_parity_and_benchmark() {
        assert!(
            cfg!(debug_assertions),
            "Never benchmark against the release database"
        );
        let path = crate::db::get_db_path();
        assert!(path.to_string_lossy().contains("time-tracker-dev"));
        assert!(
            path.exists(),
            "Start the isolated dev app to create the snapshot first"
        );
        let logs = crate::db::tables::log::get_logs().await.unwrap();
        let pool = crate::db::get_pool().await.unwrap();
        let plans: Vec<(i64, i64, i64, String)> = sqlx::query_as(
            "EXPLAIN QUERY PLAN SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs WHERE is_deleted = 0 AND timestamp >= ?1 AND timestamp <= ?2 ORDER BY rowid",
        ).bind(0i64).bind(1i64).fetch_all(&pool).await.unwrap();
        assert!(
            plans
                .iter()
                .any(|row| row.3.contains("idx_logs_active_timestamp")),
            "Window query must use the timestamp index: {plans:?}"
        );
        println!("CALENDAR_QUERY_PLAN {plans:?}");
        let anchor = logs
            .iter()
            .map(|log| log.timestamp)
            .max()
            .expect("Snapshot is empty");
        let filter_app = logs
            .iter()
            .max_by_key(|log| log.timestamp)
            .unwrap()
            .app
            .clone();
        // Run the legacy cleanup once before comparing immutable read results.
        legacy_perf::get_week(anchor, None).await.unwrap();
        let mut old_ms = Vec::new();
        let mut new_ms = Vec::new();
        for offset in [0, 7, 28, 84, 168] {
            let week = anchor - offset * 86400;
            let begin = Instant::now();
            let expected = legacy_perf::get_week(week, None).await.unwrap();
            old_ms.push(begin.elapsed().as_secs_f64() * 1000.0);
            let begin = Instant::now();
            let actual = get_week(week, None).await.unwrap();
            new_ms.push(begin.elapsed().as_secs_f64() * 1000.0);
            assert_eq!(
                serde_json::to_value(actual).unwrap(),
                serde_json::to_value(expected).unwrap(),
                "Calendar parity at offset {offset}"
            );
            let expected = legacy_perf::get_week_for_app_filter(week, filter_app.clone(), None)
                .await
                .unwrap();
            let actual = get_week_for_app_filter(week, filter_app.clone(), None)
                .await
                .unwrap();
            assert_eq!(
                serde_json::to_value(actual).unwrap(),
                serde_json::to_value(expected).unwrap(),
                "Filtered calendar parity at offset {offset}"
            );
        }
        assert!(get_week(anchor, Some(vec![])).await.unwrap().is_empty());
        if let Some(uuid) = logs.iter().find_map(|log| log.device_uuid.clone()) {
            for filter in [vec![uuid], vec!["absent-device-for-parity".to_string()]] {
                let expected = legacy_perf::get_week(anchor, Some(filter.clone()))
                    .await
                    .unwrap();
                let actual = get_week(anchor, Some(filter)).await.unwrap();
                assert_eq!(
                    serde_json::to_value(actual).unwrap(),
                    serde_json::to_value(expected).unwrap(),
                    "Device-filtered calendar parity"
                );
            }
        }
        let average = |values: &[f64]| values.iter().sum::<f64>() / values.len() as f64;
        println!("CALENDAR_BENCH old_ms={old_ms:?} new_ms={new_ms:?} old_avg_ms={:.3} new_avg_ms={:.3} improvement_pct={:.2}", average(&old_ms), average(&new_ms), (1.0 - average(&new_ms) / average(&old_ms)) * 100.0);
    }
}

#[cfg(test)]
mod week_bounds_tests {
    use super::{local_timestamp, week_bounds_from_anchor};
    use chrono::NaiveDate;

    fn local(y: i32, m: u32, d: u32, h: u32) -> i64 {
        local_timestamp(
            NaiveDate::from_ymd_opt(y, m, d)
                .unwrap()
                .and_hms_opt(h, 0, 0)
                .unwrap(),
        )
    }

    #[test]
    fn week_bounds_follow_local_calendar_start_hour() {
        // Frontend anchors on the local week start (Monday at calendarStartHour).
        let anchor = local(2026, 9, 28, 8);
        let (start, end) = week_bounds_from_anchor(anchor, 8);
        assert_eq!(start, local(2026, 9, 28, 8));
        assert_eq!(end, local(2026, 10, 5, 8) - 1);
    }

    #[test]
    fn early_morning_belongs_to_previous_calendar_day() {
        // Monday 05:00 local with an 08:00 start hour is still the previous week's Sunday.
        let (start, end) = week_bounds_from_anchor(local(2026, 10, 5, 5), 8);
        assert_eq!(start, local(2026, 9, 28, 8));
        assert!(local(2026, 10, 5, 5) <= end);
    }
}
