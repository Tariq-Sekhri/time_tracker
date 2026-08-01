use crate::db;
use crate::db::tables::device::{
    get_local_device, get_local_device_uuid, get_local_log_device_uuid,
};
use crate::db::{get_pool, Error};
use anyhow::Result;
use regex::bytes::Replacer;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};
use std::collections::HashMap;
use std::ops::DerefMut;

#[derive(Debug, Serialize, FromRow, Clone, Deserialize, PartialOrd, PartialEq, Ord, Eq)]
pub struct Log {
    pub id: i64,
    pub device_uuid: Option<String>,
    pub app: String,
    pub timestamp: i64,
    pub duration: i64,
    pub is_deleted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergedLog {
    pub ids: Vec<i64>,
    pub device_uuid: Option<String>,
    pub app: String,
    pub timestamp: i64,
    pub duration: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NewLog {
    pub app: String,
    pub device_uuid: Option<String>,
    pub timestamp: i64,
}

pub const PENDING_LOCAL_DEVICE_UUID: &str = "__pending_local__";

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS logs (
        id INTEGER NOT NULL,
        device_uuid TEXT NOT NULL,
        app TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (device_uuid, id)
    )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn ensure_logs_schema(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    migrate_logs_composite_primary_key(pool).await
}

async fn migrate_logs_composite_primary_key(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let ddl: Option<String> =
        sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'logs'")
            .fetch_optional(pool)
            .await?;

    let Some(ddl) = ddl else {
        return Ok(());
    };

    if ddl.contains("PRIMARY KEY (device_uuid, id)") {
        reclaim_pending_local_logs(pool).await?;
        return Ok(());
    }

    sqlx::query(
        "UPDATE logs SET device_uuid = (SELECT uuid FROM devices WHERE kind = 'local' LIMIT 1)
         WHERE (device_uuid IS NULL OR device_uuid = '')
           AND EXISTS (SELECT 1 FROM devices WHERE kind = 'local' LIMIT 1)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "UPDATE logs SET device_uuid = ?1
         WHERE device_uuid IS NULL OR device_uuid = ''",
    )
    .bind(PENDING_LOCAL_DEVICE_UUID)
    .execute(pool)
    .await?;

    let mut tx = pool.begin().await?;

    sqlx::query(
        "CREATE TABLE logs_new (
            id INTEGER NOT NULL,
            device_uuid TEXT NOT NULL,
            app TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            duration INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (device_uuid, id)
        )",
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT OR IGNORE INTO logs_new (id, device_uuid, app, timestamp, duration, is_deleted)
         SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs
         WHERE device_uuid IS NOT NULL AND device_uuid != ''",
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query("DROP TABLE logs").execute(&mut *tx).await?;
    sqlx::query("ALTER TABLE logs_new RENAME TO logs")
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    reclaim_pending_local_logs(pool).await?;
    Ok(())
}

async fn reclaim_pending_local_logs(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE logs SET device_uuid = (
            SELECT uuid FROM devices WHERE kind = 'local' AND token IS NOT NULL LIMIT 1
         )
         WHERE device_uuid = ?1
           AND EXISTS (SELECT 1 FROM devices WHERE kind = 'local' AND token IS NOT NULL LIMIT 1)",
    )
    .bind(PENDING_LOCAL_DEVICE_UUID)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_log(log: NewLog) -> Result<i64, sqlx::Error> {
    let pool = db::get_pool().await?;
    let local_uuid = get_local_device_uuid()
        .await
        .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    let uuid = local_uuid
        .filter(|u| !u.is_empty())
        .or_else(|| {
            log.device_uuid
                .filter(|u| u == PENDING_LOCAL_DEVICE_UUID)
        })
        .unwrap_or_else(|| PENDING_LOCAL_DEVICE_UUID.to_string());
    let next_id: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(id), 0) + 1 FROM logs WHERE device_uuid = ?1",
    )
    .bind(&uuid)
    .fetch_one(&pool)
    .await?;
    sqlx::query(
        "INSERT INTO logs (id, device_uuid, app, timestamp) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(next_id)
    .bind(&uuid)
    .bind(&log.app)
    .bind(log.timestamp)
    .execute(&pool)
    .await?;
    Ok(next_id)
}

pub async fn mark_log_deleted(id: i64) -> Result<(), sqlx::Error> {
    let pool = db::get_pool().await?;
    let uuid = get_local_device_uuid()
        .await
        .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    let Some(uuid) = uuid else {
        return Err(sqlx::Error::Protocol("local device not set".into()));
    };
    sqlx::query!(
        "UPDATE logs SET is_deleted = 1 WHERE id = ?1 AND device_uuid = ?2 AND is_deleted = 0",
        id,
        uuid
    )
    .execute(&pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_log_by_id(id: i64, uuid: String) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query!(
        "UPDATE logs SET is_deleted = 1 WHERE id = ?1 AND device_uuid = ?2 AND is_deleted = 0",
        id,
        uuid
    )
    .execute(&pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_logs_by_ids(ids: Vec<i64>, uuid: String) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let mut tx = pool.begin().await?;
    for id in ids {
        sqlx::query!(
            "UPDATE logs SET is_deleted = 1 WHERE id = ?1 AND device_uuid = ?2 AND is_deleted = 0",
            id,
            uuid
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_logs() -> Result<Vec<Log>, Error> {
    let pool = db::get_pool().await?;
    let logs = sqlx::query_as!(
        Log,
        r#"SELECT id, device_uuid, app, timestamp, duration, is_deleted as "is_deleted!: bool" FROM logs WHERE is_deleted = 0"#
    )
    .fetch_all(&pool)
    .await?;
    Ok(logs)
}

#[tauri::command]
pub async fn get_log_by_id(id: i64) -> Result<Log, Error> {
    let pool = db::get_pool().await?;
    let uuid = get_local_log_device_uuid().await?;
    let Some(uuid) = uuid else {
        return Err(anyhow::anyhow!("local device not set").into());
    };
    let log = sqlx::query_as::<_, Log>(
        "SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs WHERE id = ?1 AND device_uuid = ?2 AND is_deleted = 0",
    )
    .bind(id)
    .bind(&uuid)
    .fetch_one(&pool)
    .await?;
    Ok(log)
}

pub async fn increase_duration(id: i64) -> Result<(), sqlx::Error> {
    let pool = db::get_pool().await?;
    let uuid = get_local_log_device_uuid()
        .await
        .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    let Some(uuid) = uuid else {
        return Err(sqlx::Error::Protocol("local device not set".into()));
    };
    sqlx::query(
        "UPDATE logs SET duration = duration + 1 WHERE id = ?1 AND device_uuid = ?2 AND is_deleted = 0",
    )
    .bind(id)
    .bind(&uuid)
    .execute(&pool)
    .await?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteTimeBlockRequest {
    pub app_names: Vec<String>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetLogsForTimeBlockRequest {
    pub app_names: Vec<String>,
    pub start_time: i64,
    pub end_time: i64,
    pub min_log_duration: i64,
}

#[tauri::command]
pub async fn delete_logs_for_time_block(request: DeleteTimeBlockRequest) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let mut tx = pool.begin().await?;

    let logs = sqlx::query_as!(
        Log,
        r#"SELECT id as "id!: i64", device_uuid, app, timestamp as "timestamp!: i64", duration as "duration!: i64", is_deleted as "is_deleted!: bool" FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2 AND is_deleted = 0"#,
        request.start_time,
        request.end_time
    )
    .fetch_all(&mut *tx)
    .await?;

    let mut deleted_count = 0i64;
    for log in logs {
        if request.app_names.contains(&log.app) {
            if let Some(uuid) = &log.device_uuid {
                sqlx::query!(
                    "UPDATE logs SET is_deleted = 1 WHERE id = ?1 AND device_uuid = ?2 AND is_deleted = 0",
                    log.id,
                    uuid
                )
                .execute(&mut *tx)
                .await?;
                deleted_count += 1;
            }
        }
    }

    tx.commit().await?;

    Ok(deleted_count)
}

#[tauri::command]
pub async fn count_logs_for_time_block(request: DeleteTimeBlockRequest) -> Result<i64, Error> {
    let pool = db::get_pool().await?;

    let logs = sqlx::query_as!(
        Log,
        r#"SELECT id as "id!: i64", device_uuid, app, timestamp as "timestamp!: i64", duration as "duration!: i64", is_deleted as "is_deleted!: bool" FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2 AND is_deleted = 0"#,
        request.start_time,
        request.end_time
    )
    .fetch_all(&pool)
    .await?;

    let count = logs
        .iter()
        .filter(|log| request.app_names.contains(&log.app))
        .count();

    Ok(count as i64)
}

#[tauri::command]
pub async fn get_logs_for_time_block(
    request: GetLogsForTimeBlockRequest,
) -> Result<Vec<MergedLog>, Error> {
    let pool = db::get_pool().await?;

    let min_d = request.min_log_duration.max(1);
    let logs = sqlx::query_as::<_, Log>(
        "SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2 AND duration >= ?3 AND is_deleted = 0 ORDER BY duration DESC",
    )
    .bind(request.start_time)
    .bind(request.end_time)
    .bind(min_d)
    .fetch_all(&pool)
    .await?;

    let filtered_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| request.app_names.contains(&log.app))
        .collect();

    Ok(merge_logs_in_time_block(filtered_logs))
}

fn merge_logs_in_time_block(logs: Vec<Log>) -> Vec<MergedLog> {
    let mut app_map: HashMap<(Option<String>, String), MergedLog> = HashMap::new();
    for log in logs {
        let key = (log.device_uuid.clone(), log.app.clone());
        if let Some(existing) = app_map.get_mut(&key) {
            existing.duration += log.duration;
            existing.ids.push(log.id);
            if log.timestamp < existing.timestamp {
                existing.timestamp = log.timestamp;
            }
        } else {
            app_map.insert(
                key,
                MergedLog {
                    ids: vec![log.id],
                    device_uuid: log.device_uuid,
                    app: log.app,
                    timestamp: log.timestamp,
                    duration: log.duration,
                },
            );
        }
    }
    app_map.into_values().collect()
}

#[cfg(test)]
mod merge_logs_tests {
    use super::*;

    #[test]
    fn keeps_same_app_logs_separate_by_device_uuid() {
        let merged = merge_logs_in_time_block(vec![
            Log {
                id: 1,
                device_uuid: Some("device-a".into()),
                app: "Editor".into(),
                timestamp: 100,
                duration: 30,
                is_deleted: false,
            },
            Log {
                id: 2,
                device_uuid: Some("device-b".into()),
                app: "Editor".into(),
                timestamp: 110,
                duration: 45,
                is_deleted: false,
            },
        ]);

        assert_eq!(merged.len(), 2);
        assert!(merged.iter().any(|log| {
            log.device_uuid.as_deref() == Some("device-a") && log.ids == vec![1]
        }));
        assert!(merged.iter().any(|log| {
            log.device_uuid.as_deref() == Some("device-b") && log.ids == vec![2]
        }));
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetLogsByCategoryRequest {
    pub category: String,
    pub start_time: i64,
    pub end_time: i64,
    pub min_log_duration: i64,
}

#[tauri::command]
pub async fn get_logs_by_category(
    request: GetLogsByCategoryRequest,
) -> Result<Vec<MergedLog>, Error> {
    use crate::db::tables::{cat_regex, category, skipped_app};
    use cat_regex::get_cat_regex;
    use category::get_categories;
    use regex::Regex;
    use skipped_app::get_skipped_apps;
    use std::collections::HashMap;

    let pool = db::get_pool().await?;

    let min_d = request.min_log_duration.max(1);
    let mut logs = sqlx::query_as::<_, Log>(
        "SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs WHERE timestamp >= ?1 AND timestamp <= ?2 AND duration >= ?3 AND is_deleted = 0 ORDER BY duration DESC",
    )
    .bind(request.start_time)
    .bind(request.end_time)
    .bind(min_d)
    .fetch_all(&pool)
    .await?;

    let skipped_apps = get_skipped_apps().await?;
    let mut skipped_regexes: Vec<Regex> = Vec::new();
    for app in skipped_apps {
        skipped_regexes.push(Regex::new(&app.regex)?);
    }

    let is_skipped =
        |app_name: &str| -> bool { skipped_regexes.iter().any(|regex| regex.is_match(app_name)) };

    logs.retain(|log| !is_skipped(&log.app));

    let categories = get_categories().await?;
    let cat_regex_list = get_cat_regex().await?;

    let category_map: HashMap<i32, &category::Category> =
        categories.iter().map(|cat| (cat.id, cat)).collect();

    let mut regex_list: Vec<(Regex, String)> = Vec::new();
    for reg in cat_regex_list {
        if let Some(cat) = category_map.get(&reg.cat_id) {
            regex_list.push((Regex::new(&reg.regex)?, cat.name.clone()));
        }
    }

    regex_list.sort_by_key(|(_, cat_name)| {
        categories
            .iter()
            .find(|c| c.name == *cat_name)
            .map(|c| std::cmp::Reverse(c.priority))
            .unwrap_or(std::cmp::Reverse(0))
    });

    let filtered_logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| {
            let matched_category = regex_list
                .iter()
                .find(|(regex, _)| regex.is_match(&log.app))
                .map(|(_, cat_name)| cat_name.clone())
                .unwrap_or_else(|| "Miscellaneous".to_string());

            matched_category == request.category
        })
        .collect();

    Ok(merge_logs_in_time_block(filtered_logs))
}

#[tauri::command]
pub async fn get_logs_for_app_in_time_range(
    app: String,
    range_start: i64,
    range_end: i64,
    min_log_duration: i64,
) -> Result<Vec<Log>, Error> {
    use crate::db::tables::skipped_app::get_skipped_apps;
    use regex::Regex;

    let pool = db::get_pool().await?;

    let skipped_apps = get_skipped_apps().await?;
    let skipped_regexes: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|a| Regex::new(&a.regex).ok())
        .collect();
    let is_skipped =
        |name: &str| -> bool { skipped_regexes.iter().any(|regex| regex.is_match(name)) };

    if is_skipped(&app) {
        return Ok(Vec::new());
    }

    let min_d = min_log_duration.max(1);
    let logs = sqlx::query_as::<_, Log>(
        "SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs WHERE app = ?1 AND timestamp >= ?2 AND timestamp <= ?3 AND duration >= ?4 AND is_deleted = 0 ORDER BY timestamp ASC",
    )
    .bind(&app)
    .bind(range_start)
    .bind(range_end)
    .bind(min_d)
    .fetch_all(&pool)
    .await?;

    let logs: Vec<Log> = logs
        .into_iter()
        .filter(|log| !is_skipped(&log.app))
        .collect();

    Ok(logs)
}

pub(crate) async fn set_local_device_uuid_with_tx(
    tx: &mut Transaction<'_, Sqlite>,
    uuid: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE logs SET device_uuid = ?1
         WHERE device_uuid IS NULL OR device_uuid = '' OR device_uuid = ?2",
    )
    .bind(uuid)
    .bind(PENDING_LOCAL_DEVICE_UUID)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn get_local_logs() -> anyhow::Result<Vec<Log>> {
    let pool = get_pool().await?;
    let uuid = get_local_device_uuid()
        .await
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    let Some(uuid) = uuid else {
        return Ok(vec![]);
    };

    let logs = sqlx::query_as::<_, Log>(
        r#"
        SELECT *
        FROM logs
        WHERE device_uuid = ?
          AND is_deleted = 0
          AND id != (
              SELECT MAX(id)
              FROM logs
              WHERE device_uuid = ?
                AND is_deleted = 0
          )
        ORDER BY id ASC
        "#,
    )
    .bind(&uuid)
    .bind(&uuid)
    .fetch_all(&pool)
    .await?;
    Ok(logs)
}

pub async fn consolidate_local_logs_for_reupload(current_uuid: &str) -> Result<(), Error> {
    let pool = get_pool().await?;
    sqlx::query(
        "UPDATE logs SET device_uuid = ?1
         WHERE is_deleted = 0
         AND (device_uuid IS NULL OR device_uuid = '' OR device_uuid = ?2
              OR device_uuid IN (SELECT uuid FROM devices WHERE kind = 'local'))",
    )
    .bind(current_uuid)
    .bind(PENDING_LOCAL_DEVICE_UUID)
    .execute(&pool)
    .await?;
    Ok(())
}

pub async fn get_all_local_logs_for_reupload(uuid: &str) -> Result<Vec<Log>, Error> {
    let pool = get_pool().await?;
    let logs = sqlx::query_as::<_, Log>(
        "SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs
         WHERE device_uuid = ?1 AND is_deleted = 0
         ORDER BY id ASC",
    )
    .bind(uuid)
    .fetch_all(&pool)
    .await?;
    Ok(logs)
}

pub async fn get_logs_for_sync() -> Result<Vec<Log>, Error> {
    let pool = get_pool().await?;
    let device = get_local_device()
        .await?
        .ok_or(anyhow::anyhow!("local device not set found"))?;
    let logs = sqlx::query_as::<_, Log>(
        r#"
        SELECT *
        FROM logs
        WHERE device_uuid = ?
          AND is_deleted = 0
          AND id != (
              SELECT MAX(id)
              FROM logs
              WHERE device_uuid = ?
                AND is_deleted = 0
          )
        and
            id > ?
        ORDER BY id ASC
        "#,
    )
    .bind(&device.uuid)
    .bind(&device.uuid)
    .bind(&device.last_sync_id)
    .fetch_all(&pool)
    .await?;
    Ok(logs)
}

pub async fn get_local_deleted_logs() -> Result<Vec<Log>, Error> {
    let Some(uuid) = get_local_device_uuid().await? else {
        return Ok(Vec::new());
    };
    let logs = sqlx::query_as::<_, Log>(
        "SELECT * FROM logs WHERE is_deleted = 1 AND device_uuid = ?1 ORDER BY id ASC",
    )
    .bind(uuid)
    .fetch_all(&get_pool().await?)
    .await?;
    Ok(logs)
}

pub async fn delete_local_deleted_logs() -> Result<(), Error> {
    let Some(uuid) = get_local_device_uuid().await? else {
        return Ok(());
    };
    sqlx::query("DELETE FROM logs WHERE is_deleted = 1 AND device_uuid = ?1")
        .bind(uuid)
        .execute(&get_pool().await?)
        .await?;
    Ok(())
}

pub async fn delete_logs_for_device(device_uuid: &str) -> Result<(), Error> {
    let pool = get_pool().await?;
    delete_logs_for_device_with_executor(&pool, device_uuid).await?;
    Ok(())
}

pub(crate) async fn delete_logs_for_device_with_executor<'e, E>(
    executor: E,
    device_uuid: &str,
) -> Result<(), sqlx::Error>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    sqlx::query("DELETE FROM logs WHERE device_uuid = ?1")
        .bind(device_uuid)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn insert_logs(logs: &Vec<Log>) -> Result<(), Error> {
    let mut tx = get_pool().await?.begin().await?;
    for log in logs {
        let Some(uuid) = &log.device_uuid else {
            continue;
        };
        sqlx::query(
            "INSERT OR IGNORE INTO logs (id, device_uuid, app, timestamp, duration, is_deleted)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        )
        .bind(log.id)
        .bind(uuid)
        .bind(&log.app)
        .bind(log.timestamp)
        .bind(log.duration)
        .execute(tx.deref_mut())
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
