use super::AfkStatus;
use crate::db::{get_pool, tables::log::Log, Error};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::sync::{Mutex, OnceLock};

fn error_slot() -> &'static Mutex<Option<String>> {
    static ERROR: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    ERROR.get_or_init(|| Mutex::new(None))
}
pub fn last_error() -> Option<String> {
    error_slot()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}
pub fn set_error(error: Option<String>) {
    *error_slot().lock().unwrap_or_else(|e| e.into_inner()) = error;
}

#[derive(Default)]
pub struct Writer {
    last: Option<(i64, String, i64, i32, u32, u32, i64)>,
    settings: String,
    settings_id: i64,
    connection_options: Option<std::sync::Arc<sqlx::sqlite::SqliteConnectOptions>>,
}
impl Writer {
    pub async fn write(&mut self, status: &AfkStatus) -> Result<(), Error> {
        let pool = get_pool().await?;
        let device = crate::db::tables::device::get_local_log_device_uuid()
            .await?
            .unwrap_or_else(|| crate::db::tables::log::PENDING_LOCAL_DEVICE_UUID.into());
        self.write_sample(&pool, device, status).await
    }
    async fn write_sample(
        &mut self,
        pool: &sqlx::SqlitePool,
        device: String,
        status: &AfkStatus,
    ) -> Result<(), Error> {
        // Pool replacement (database switch or restore) invalidates row IDs.
        let options = pool.connect_options();
        if self
            .connection_options
            .as_ref()
            .is_none_or(|previous| !std::sync::Arc::ptr_eq(previous, &options))
        {
            self.last = None;
            self.settings.clear();
            self.settings_id = 0;
            self.connection_options = Some(options);
        }
        let json = serde_json::to_string(&status.settings)?;
        if self.settings != json || self.settings_id == 0 {
            sqlx::query("INSERT OR IGNORE INTO afk_configurations(settings_json) VALUES (?1)")
                .bind(&json)
                .execute(pool)
                .await?;
            self.settings_id =
                sqlx::query_scalar("SELECT id FROM afk_configurations WHERE settings_json=?1")
                    .bind(&json)
                    .fetch_one(pool)
                    .await?;
            self.settings = json;
        }
        if device != crate::db::tables::log::PENDING_LOCAL_DEVICE_UUID
            && self
                .last
                .as_ref()
                .is_none_or(|previous| previous.1 != device)
        {
            sqlx::query("UPDATE afk_intervals SET device_uuid=?1 WHERE device_uuid=?2")
                .bind(&device)
                .bind(crate::db::tables::log::PENDING_LOCAL_DEVICE_UUID)
                .execute(pool)
                .await?;
        }
        let state = match status.decision.state.as_str() {
            "present" => 1,
            "afk" => 2,
            _ => 0,
        };
        let known = status.decision.known_mask;
        let active = status.decision.active_mask;
        let time = status.timestamp;
        if let Some((
            id,
            previous_device,
            end,
            previous_state,
            previous_known,
            previous_active,
            config,
        )) = &self.last
        {
            if *end == time + 1 {
                return Ok(());
            } // Same collector sample, never count it twice.
            if previous_device == &device
                && *end == time
                && (*previous_state, *previous_known, *previous_active, *config)
                    == (state, known, active, self.settings_id)
            {
                sqlx::query("UPDATE afk_intervals SET end_time=?2 WHERE id=?1")
                    .bind(id)
                    .bind(time + 1)
                    .execute(pool)
                    .await?;
                self.last.as_mut().unwrap().2 = time + 1;
                return Ok(());
            }
        }
        let id = sqlx::query("INSERT INTO afk_intervals(device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id) VALUES (?1,?2,?3,?4,?5,?6,?7)")
            .bind(&device).bind(time).bind(time+1).bind(state).bind(known).bind(active).bind(self.settings_id)
            .execute(pool).await?.last_insert_rowid();
        self.last = Some((id, device, time + 1, state, known, active, self.settings_id));
        Ok(())
    }
}

#[derive(Debug, Serialize, FromRow, Clone)]
pub struct Interval {
    pub device_uuid: String,
    pub start_time: i64,
    pub end_time: i64,
    pub state: i32,
    pub known_mask: i64,
    pub active_mask: i64,
    pub settings_id: i64,
}
#[tauri::command]
pub async fn get_afk_intervals(
    range_start: i64,
    range_end: i64,
    device_uuids: Option<Vec<String>>,
) -> Result<Vec<Interval>, Error> {
    let pool = get_pool().await?;
    let local = crate::db::tables::device::get_local_log_device_uuid().await?;
    let intervals = sqlx::query_as::<_, Interval>("SELECT device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id FROM afk_intervals WHERE start_time < ?2 AND end_time > ?1 ORDER BY device_uuid,start_time")
        .bind(range_start).bind(range_end).fetch_all(&pool).await?;
    Ok(intervals
        .into_iter()
        .filter(|i| {
            device_uuids.as_ref().map_or(true, |ids| {
                ids.contains(&i.device_uuid)
                    || (ids.iter().any(|id| id == "local")
                        && local.as_deref() == Some(i.device_uuid.as_str()))
            })
        })
        .collect())
}
#[derive(Serialize)]
pub struct StorageInfo {
    intervals: i64,
    afk_seconds: i64,
    allocated_bytes: Option<i64>,
    activity_rows: i64,
}

#[tauri::command]
pub async fn get_afk_time_blocks(
    range_start: i64, range_end: i64, device_uuids: Option<Vec<String>>,
    settings: crate::db::queries::week::TimeBlockSettings,
) -> Result<Vec<crate::db::queries::week::AfkDisplayBlock>, Error> {
    let intervals=get_afk_intervals(range_start,range_end,device_uuids).await?;
    crate::db::queries::week::afk_display_blocks(&intervals,range_start,range_end,&settings)
}
#[tauri::command]
pub async fn get_afk_storage() -> Result<StorageInfo, Error> {
    let pool = get_pool().await?;
    let (intervals, afk_seconds): (i64,i64) = sqlx::query_as("SELECT COUNT(*),COALESCE(SUM(CASE WHEN state=2 THEN end_time-start_time ELSE 0 END),0) FROM afk_intervals").fetch_one(&pool).await?;
    let allocated_bytes = sqlx::query_scalar::<_,i64>("SELECT COALESCE(SUM(pgsize),0) FROM dbstat WHERE name IN ('afk_intervals','afk_configurations','idx_afk_device_time','sqlite_autoindex_afk_configurations_1','afk_remote_intervals','afk_sync_cursors','sqlite_autoindex_afk_remote_intervals_1','sqlite_autoindex_afk_sync_cursors_1')").fetch_one(&pool).await.ok();
    let activity_rows = sqlx::query_scalar("SELECT COUNT(*) FROM logs")
        .fetch_one(&pool)
        .await?;
    Ok(StorageInfo {
        intervals,
        afk_seconds,
        allocated_bytes,
        activity_rows,
    })
}

// This scope belongs to one query future. Concurrent/unfiltered requests and
// recorder/sync tasks cannot inherit it. All AFK operations are read-only.
tokio::task_local! { static EXCLUDE_AFK: bool; }
pub fn filter_requested() -> bool {
    EXCLUDE_AFK.try_with(|value| *value).unwrap_or(false)
}

// Match the collector's continuity window. Explicit present/unknown samples
// always break continuity; only missing samples bracketed by AFK are bridged.
pub const SAMPLING_GAP_SECONDS: i64 = 5;
pub fn continuous_away(intervals: &[Interval]) -> Vec<Interval> {
    let mut ordered=intervals.iter().collect::<Vec<_>>();
    ordered.sort_by(|a,b|a.device_uuid.cmp(&b.device_uuid).then(a.start_time.cmp(&b.start_time)));
    let mut result=Vec::<Interval>::new();let mut previous_away=false;
    for interval in ordered {
        if interval.state!=2 {previous_away=false;continue;}
        if previous_away {
            if let Some(previous)=result.last_mut() {
                if previous.device_uuid==interval.device_uuid&&interval.start_time<=previous.end_time.saturating_add(SAMPLING_GAP_SECONDS) {
                    previous.end_time=previous.end_time.max(interval.end_time);continue;
                }
            }
        }
        result.push(interval.clone());previous_away=true;
    }
    result
}

pub async fn filter_logs(logs: Vec<Log>) -> Result<Vec<Log>, Error> {
    if !filter_requested() || logs.is_empty() {
        return Ok(logs);
    }
    let start = logs.iter().map(|l| l.timestamp).min().unwrap();
    let end = logs
        .iter()
        .map(|l| l.timestamp.saturating_add(l.duration))
        .max()
        .unwrap();
    let padding=SAMPLING_GAP_SECONDS+1;
    let intervals = get_afk_intervals(start.saturating_sub(padding), end.saturating_add(padding), None).await?;
    Ok(subtract(logs, &continuous_away(&intervals)))
}
pub fn subtract(logs: Vec<Log>, intervals: &[Interval]) -> Vec<Log> {
    let mut by_device = std::collections::HashMap::<&str, Vec<(i64, i64)>>::new();
    for i in intervals.iter().filter(|i| i.state == 2) {
        by_device
            .entry(&i.device_uuid)
            .or_default()
            .push((i.start_time, i.end_time));
    }
    for spans in by_device.values_mut() {
        spans.sort_unstable();
        // Normalize overlapping evidence before binary-searching by end time.
        let mut merged=Vec::<(i64,i64)>::new();
        for &(start,end) in spans.iter() {
            if let Some(previous)=merged.last_mut() {
                if previous.1>=start {previous.1=previous.1.max(end);continue;}
            }
            merged.push((start,end));
        }
        *spans=merged;
    }
    let mut result = Vec::with_capacity(logs.len());
    for log in logs {
        let Some(spans) = log.device_uuid.as_deref().and_then(|d| by_device.get(d)) else {
            result.push(log);
            continue;
        };
        let stop = log.timestamp.saturating_add(log.duration);
        let mut cursor = log.timestamp;
        let first = spans.partition_point(|&(_, end)| end <= cursor);
        for &(start, end) in &spans[first..] {
            if start >= stop {
                break;
            }
            if start > cursor {
                let mut piece = log.clone();
                piece.timestamp = cursor;
                piece.duration = start.min(stop) - cursor;
                result.push(piece);
            }
            cursor = cursor.max(end);
            if cursor >= stop {
                break;
            }
        }
        if cursor < stop {
            let mut piece = log;
            piece.timestamp = cursor;
            piece.duration = stop - cursor;
            result.push(piece);
        }
    }
    result
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct QueryArgs {
    week_anchor: Option<i64>,
    app_name: Option<String>,
    week_start: Option<i64>,
    week_end: Option<i64>,
    day_start: Option<i64>,
    day_end: Option<i64>,
    device_uuids: Option<Vec<String>>,
    include_manual: Option<bool>,
    category_names: Option<Vec<String>>,
    weeks: Option<Vec<crate::db::queries::statistics::StatisticsRange>>,
    request: Option<serde_json::Value>,
    app: Option<String>,
    range_start: Option<i64>,
    range_end: Option<i64>,
    min_log_duration: Option<i64>,
}
fn required<T>(value: Option<T>) -> Result<T, Error> {
    value.ok_or_else(|| anyhow::anyhow!("Missing AFK query argument").into())
}
#[tauri::command]
pub async fn query_afk(
    command: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, Error> {
    let a: QueryArgs = serde_json::from_value(args)?;
    EXCLUDE_AFK
        .scope(true, async move {
            use crate::db::{queries as q, tables::log as l};
            let result = match command.as_str() {
                "get_logs" => serde_json::to_value(l::get_logs().await?),
                "get_week" => serde_json::to_value(
                    q::get_week(required(a.week_anchor)?, a.device_uuids).await?,
                ),
                "get_week_for_app_filter" => serde_json::to_value(
                    q::get_week_for_app_filter(
                        required(a.week_anchor)?,
                        required(a.app_name)?,
                        a.device_uuids,
                    )
                    .await?,
                ),
                "get_week_statistics" => serde_json::to_value(
                    q::get_week_statistics(
                        required(a.week_start)?,
                        required(a.week_end)?,
                        a.device_uuids,
                        a.include_manual,
                        a.category_names,
                    )
                    .await?,
                ),
                "get_day_statistics" => serde_json::to_value(
                    q::get_day_statistics(
                        required(a.day_start)?,
                        required(a.day_end)?,
                        a.device_uuids,
                        a.include_manual,
                        a.category_names,
                    )
                    .await?,
                ),
                "get_trend_statistics" => serde_json::to_value(
                    q::get_trend_statistics(required(a.weeks)?, a.device_uuids, a.include_manual)
                        .await?,
                ),
                "get_statistics_bounds" => {
                    serde_json::to_value(q::get_statistics_bounds(a.include_manual).await?)
                }
                "get_total_statistics" => {
                    serde_json::to_value(q::get_total_statistics(a.include_manual).await?)
                }
                "get_logs_by_category" => serde_json::to_value(
                    l::get_logs_by_category(serde_json::from_value(required(a.request)?)?).await?,
                ),
                "get_logs_for_time_block" => serde_json::to_value(
                    l::get_logs_for_time_block(serde_json::from_value(required(a.request)?)?)
                        .await?,
                ),
                "get_logs_for_app_in_time_range" => serde_json::to_value(
                    l::get_logs_for_app_in_time_range(
                        required(a.app)?,
                        required(a.range_start)?,
                        required(a.range_end)?,
                        a.min_log_duration.unwrap_or(1),
                    )
                    .await?,
                ),
                _ => return Err(anyhow::anyhow!("Unsupported AFK query").into()),
            };
            Ok(result?)
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn afk_storage_coalesces_evidence_preserves_activity_and_settings() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::tables::log::create_table(&pool).await.unwrap();
        sqlx::query("INSERT INTO logs(id,device_uuid,app,timestamp,duration) VALUES (1,'a','Movie',100,100)").execute(&pool).await.unwrap();
        let before = sqlx::query_as::<_, Log>("SELECT * FROM logs")
            .fetch_all(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../migrations/0014_afk_evidence.sql"))
            .execute(&pool)
            .await
            .unwrap();
        let settings = crate::afk::AfkSettings::default();
        let mut status = AfkStatus {
            timestamp: 100,
            observations: vec![],
            decision: crate::afk::Decision {
                state: "afk".into(),
                away_score: 100,
                agreeing_sources: 1,
                away_weight: 60,
                present_weight: 0,
                known_mask: 1,
                active_mask: 0,
            },
            recording: true,
            storage_error: None,
            settings,
        };
        let mut writer = Writer::default();
        for time in 100..200 {
            status.timestamp = time;
            writer
                .write_sample(&pool, "a".into(), &status)
                .await
                .unwrap();
        }
        writer
            .write_sample(&pool, "a".into(), &status)
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM afk_intervals")
                .fetch_one(&pool)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT end_time-start_time FROM afk_intervals")
                .fetch_one(&pool)
                .await
                .unwrap(),
            100
        );
        status.timestamp = 205;
        writer
            .write_sample(&pool, "a".into(), &status)
            .await
            .unwrap();
        status.timestamp = 206;
        status.settings.sources[4].weight = 0;
        writer
            .write_sample(&pool, "a".into(), &status)
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM afk_configurations")
                .fetch_one(&pool)
                .await
                .unwrap(),
            2
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM afk_intervals")
                .fetch_one(&pool)
                .await
                .unwrap(),
            3
        );
        let evidence=sqlx::query_as::<_,Interval>("SELECT device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id FROM afk_intervals").fetch_all(&pool).await.unwrap();
        assert!(subtract(before.clone(), &evidence).is_empty());
        assert_eq!(
            sqlx::query_as::<_, Log>("SELECT * FROM logs")
                .fetch_all(&pool)
                .await
                .unwrap(),
            before
        );
        let switched = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../migrations/0014_afk_evidence.sql"))
            .execute(&switched)
            .await
            .unwrap();
        sqlx::query("INSERT INTO afk_configurations VALUES (1,'unrelated settings')")
            .execute(&switched)
            .await
            .unwrap();
        status.timestamp = 300;
        writer
            .write_sample(&switched, "a".into(), &status)
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM afk_intervals")
                .fetch_one(&switched)
                .await
                .unwrap(),
            1
        );
        let stored: String = sqlx::query_scalar("SELECT settings_json FROM afk_configurations JOIN afk_intervals ON afk_configurations.id=afk_intervals.settings_id").fetch_one(&switched).await.unwrap();
        assert_eq!(stored, serde_json::to_string(&status.settings).unwrap());
        switched.close().await;
        pool.close().await;
    }
    #[test]
    fn partial_overlap_preserves_originals_and_other_devices() {
        let logs = vec![
            Log {
                id: 1,
                device_uuid: Some("a".into()),
                app: "Movie".into(),
                timestamp: 100,
                duration: 100,
                is_deleted: false,
            },
            Log {
                id: 2,
                device_uuid: Some("b".into()),
                app: "Editor".into(),
                timestamp: 100,
                duration: 100,
                is_deleted: false,
            },
        ];
        let intervals = vec![Interval {
            device_uuid: "a".into(),
            start_time: 120,
            end_time: 180,
            state: 2,
            known_mask: 1,
            active_mask: 0,
            settings_id: 1,
        }];
        let filtered = subtract(logs.clone(), &intervals);
        assert_eq!(filtered.iter().map(|l| l.duration).sum::<i64>(), 140);
        assert_eq!(
            filtered
                .iter()
                .filter(|l| l.id == 1)
                .map(|l| (l.timestamp, l.duration))
                .collect::<Vec<_>>(),
            vec![(100, 20), (180, 20)]
        );
        assert_eq!(logs[0].duration, 100);
    }
    #[test]
    fn sampling_holes_between_away_samples_do_not_leak_into_activity() {
        let interval=|start,end,state|Interval{device_uuid:"a".into(),start_time:start,end_time:end,state,known_mask:1,active_mask:0,settings_id:1};
        let evidence=vec![interval(120,160,2),interval(162,200,2)];
        let logs=vec![Log{id:1,device_uuid:Some("a".into()),app:"Lock screen".into(),timestamp:100,duration:120,is_deleted:false},Log{id:1,device_uuid:Some("b".into()),app:"Phone".into(),timestamp:100,duration:120,is_deleted:false}];
        let filtered=subtract(logs.clone(),&continuous_away(&evidence));
        assert_eq!(filtered.iter().filter(|l|l.device_uuid.as_deref()==Some("a")).map(|l|(l.timestamp,l.duration)).collect::<Vec<_>>(),vec![(100,20),(200,20)]);
        assert_eq!(filtered.iter().find(|l|l.device_uuid.as_deref()==Some("b")).unwrap(),&logs[1]);
        for state in [0,1] {
            let mut recorded=evidence.clone();recorded.push(interval(160,162,state));
            assert_eq!(continuous_away(&recorded).len(),2);
            assert!(subtract(logs.clone(),&continuous_away(&recorded)).iter().any(|l|l.device_uuid.as_deref()==Some("a")&&l.timestamp==160&&l.duration==2));
        }
        assert_eq!(continuous_away(&[interval(120,160,2),interval(166,200,2)]).len(),2);
    }
    #[tokio::test]
    async fn concurrent_queries_do_not_share_filter() {
        EXCLUDE_AFK
            .scope(true, async {
                assert!(filter_requested());
                assert!(!tokio::spawn(async { filter_requested() }).await.unwrap());
            })
            .await;
        assert!(!filter_requested());
    }
}
