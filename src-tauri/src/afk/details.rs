use super::{
    storage::{continuous_away, subtract, Interval, SAMPLING_GAP_SECONDS},
    AfkSettings,
};
use crate::db::{get_pool, tables::log::Log, Error};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

#[derive(Serialize)]
pub struct Evidence {
    start_time: i64,
    end_time: i64,
    known_mask: i64,
    active_mask: i64,
    settings: AfkSettings,
}
#[derive(FromRow)]
struct Row {
    start_time: i64,
    end_time: i64,
    known_mask: i64,
    active_mask: i64,
    settings_json: String,
}
#[derive(Serialize)]
pub struct Details {
    pub device_uuid: String,
    pub evidence: Vec<Evidence>,
    pub logs: Vec<Log>,
}

#[tauri::command]
pub async fn get_afk_block_details(
    device_uuid: String,
    range_start: i64,
    range_end: i64,
) -> Result<Details, Error> {
    details_from_pool(&get_pool().await?, device_uuid, range_start, range_end).await
}

async fn details_from_pool(
    pool: &SqlitePool,
    device: String,
    start: i64,
    end: i64,
) -> Result<Details, Error> {
    if end <= start {
        return Err(anyhow::anyhow!("Invalid AFK block range").into());
    }
    let rows=sqlx::query_as::<_,Row>("SELECT a.start_time,a.end_time,a.known_mask,a.active_mask,c.settings_json FROM afk_intervals a JOIN afk_configurations c ON c.id=a.settings_id WHERE a.device_uuid=? AND a.state=2 AND a.start_time<? AND a.end_time>? ORDER BY a.start_time")
        .bind(&device).bind(end).bind(start).fetch_all(pool).await?;
    let evidence = rows
        .into_iter()
        .map(|r| {
            Ok(Evidence {
                start_time: r.start_time.max(start),
                end_time: r.end_time.min(end),
                known_mask: r.known_mask,
                active_mask: r.active_mask,
                settings: serde_json::from_str(&r.settings_json)?,
            })
        })
        .collect::<Result<Vec<_>, Error>>()?;
    // Direct raw read, deliberately outside the normal filtered activity commands.
    let mut logs=sqlx::query_as::<_,Log>("SELECT id,device_uuid,app,timestamp,duration,is_deleted FROM logs WHERE device_uuid=? AND is_deleted=0 AND timestamp<? AND timestamp+duration>? ORDER BY timestamp,id")
        .bind(&device).bind(end).bind(start).fetch_all(pool).await?;
    for log in &mut logs {
        let stop = log.timestamp.saturating_add(log.duration).min(end);
        log.timestamp = log.timestamp.max(start);
        log.duration = stop - log.timestamp;
    }
    let padding=SAMPLING_GAP_SECONDS+1;
    let intervals=sqlx::query_as::<_,Interval>("SELECT device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id FROM afk_intervals WHERE device_uuid=? AND start_time<? AND end_time>? ORDER BY start_time")
        .bind(&device).bind(end.saturating_add(padding)).bind(start.saturating_sub(padding)).fetch_all(pool).await?;
    let intervals=continuous_away(&intervals);
    // The complement of away evidence is present/unknown time. Remove that
    // complement to retain only captured logs inside exact away intervals.
    let present = subtract(logs.clone(), &intervals);
    let non_away = present
        .into_iter()
        .map(|l| Interval {
            device_uuid: device.clone(),
            start_time: l.timestamp,
            end_time: l.timestamp + l.duration,
            state: 2,
            known_mask: 0,
            active_mask: 0,
            settings_id: 0,
        })
        .collect::<Vec<_>>();
    let logs = subtract(logs, &non_away);
    Ok(Details {
        device_uuid: device,
        evidence,
        logs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn afk_details_preserve_saved_settings_and_only_contain_matching_away_logs() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../migrations/0014_afk_evidence.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql("CREATE TABLE logs(id INTEGER,device_uuid TEXT,app TEXT,timestamp INTEGER,duration INTEGER,is_deleted INTEGER); INSERT INTO logs VALUES (1,'a','Editor',100,200,0),(1,'b','Phone',100,200,0),(2,'a','Deleted',100,200,1)").execute(&pool).await.unwrap();
        let settings = AfkSettings::default();
        sqlx::query("INSERT INTO afk_configurations(settings_json) VALUES (?)")
            .bind(serde_json::to_string(&settings).unwrap())
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql("INSERT INTO afk_intervals(device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id) VALUES ('a',120,160,2,1,0,1),('a',180,220,2,1,0,1),('b',120,220,2,1,0,1)").execute(&pool).await.unwrap();
        let details = details_from_pool(&pool, "a".into(), 130, 200)
            .await
            .unwrap();
        assert_eq!(details.evidence.len(), 2);
        assert_eq!(details.evidence[0].settings, settings);
        assert_eq!(
            details
                .logs
                .iter()
                .map(|l| (
                    l.device_uuid.as_deref().unwrap(),
                    l.app.as_str(),
                    l.timestamp,
                    l.duration
                ))
                .collect::<Vec<_>>(),
            vec![("a", "Editor", 130, 30), ("a", "Editor", 180, 20)]
        );
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM logs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 3);
        assert!(details_from_pool(&pool, "other".into(), 130, 200)
            .await
            .unwrap()
            .logs
            .is_empty());
    }
}
