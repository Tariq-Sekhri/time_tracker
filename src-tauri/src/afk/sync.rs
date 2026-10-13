//! Incremental sidecar sync. Original activity rows never pass through AFK filtering.
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

pub const PAGE_SIZE: usize = 500;

#[derive(Clone, Debug, Deserialize, Serialize, FromRow)]
pub struct Evidence {
    pub id: i64,
    pub start_time: i64,
    pub end_time: i64,
    pub state: i32,
    pub known_mask: i64,
    pub active_mask: i64,
    pub settings_json: String,
    #[serde(default)]
    pub revision: i64,
}

pub async fn upload_cursor(pool: &SqlitePool, device: &str) -> Result<i64, Error> {
    Ok(
        sqlx::query_scalar("SELECT upload_id FROM afk_sync_cursors WHERE device_uuid=?")
            .bind(device)
            .fetch_optional(pool)
            .await?
            .unwrap_or(0),
    )
}

pub async fn download_cursor(pool: &SqlitePool, device: &str) -> Result<i64, Error> {
    Ok(
        sqlx::query_scalar("SELECT download_revision FROM afk_sync_cursors WHERE device_uuid=?")
            .bind(device)
            .fetch_optional(pool)
            .await?
            .unwrap_or(0),
    )
}

pub async fn upload_page(
    pool: &SqlitePool,
    device: &str,
    after: i64,
    through: i64,
) -> Result<Vec<Evidence>, Error> {
    // Include the last acknowledged ID: the recorder may still be extending it.
    Ok(sqlx::query_as("SELECT a.id,a.start_time,a.end_time,a.state,a.known_mask,a.active_mask,c.settings_json,0 AS revision
        FROM afk_intervals a JOIN afk_configurations c ON c.id=a.settings_id
        WHERE a.device_uuid=? AND a.id>=? AND a.id<=?
        AND NOT EXISTS(SELECT 1 FROM afk_remote_intervals r WHERE r.interval_id=a.id)
        ORDER BY a.id LIMIT ?")
        .bind(device).bind(after).bind(through).bind(PAGE_SIZE as i64).fetch_all(pool).await?)
}

pub async fn acknowledge_upload(pool: &SqlitePool, device: &str, id: i64) -> Result<(), Error> {
    sqlx::query(
        "INSERT INTO afk_sync_cursors(device_uuid,upload_id) VALUES (?,?)
        ON CONFLICT(device_uuid) DO UPDATE SET upload_id=MAX(upload_id,excluded.upload_id)",
    )
    .bind(device)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn import_page(pool: &SqlitePool, device: &str, page: &[Evidence]) -> Result<(), Error> {
    // Evidence and cursor commit together so failures/retries cannot skip history.
    let mut tx = pool.begin().await?;
    for e in page {
        let settings: serde_json::Value = serde_json::from_str(&e.settings_json)?;
        if e.id <= 0
            || e.revision <= 0
            || e.start_time < 0
            || e.end_time <= e.start_time
            || !(0..=2).contains(&e.state)
            || !(0..=2047).contains(&e.known_mask)
            || !(0..=2047).contains(&e.active_mask)
            || e.active_mask & !e.known_mask != 0
            || !settings.is_object()
        {
            return Err(anyhow::anyhow!("Invalid synced AFK evidence").into());
        }
        let existing: Option<(i64,i64)> = sqlx::query_as("SELECT interval_id,revision FROM afk_remote_intervals WHERE device_uuid=? AND source_id=?")
            .bind(device).bind(e.id).fetch_optional(&mut *tx).await?;
        if existing.is_some_and(|(_, revision)| revision >= e.revision) {
            continue;
        }
        sqlx::query("INSERT OR IGNORE INTO afk_configurations(settings_json) VALUES (?)")
            .bind(&e.settings_json)
            .execute(&mut *tx)
            .await?;
        let settings_id: i64 =
            sqlx::query_scalar("SELECT id FROM afk_configurations WHERE settings_json=?")
                .bind(&e.settings_json)
                .fetch_one(&mut *tx)
                .await?;
        let id = if let Some((id, _)) = existing {
            sqlx::query("UPDATE afk_intervals SET start_time=?,end_time=?,state=?,known_mask=?,active_mask=?,settings_id=? WHERE id=? AND device_uuid=?")
                .bind(e.start_time).bind(e.end_time).bind(e.state).bind(e.known_mask).bind(e.active_mask)
                .bind(settings_id).bind(id).bind(device).execute(&mut *tx).await?;
            id
        } else {
            sqlx::query("INSERT INTO afk_intervals(device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id) VALUES (?,?,?,?,?,?,?)")
                .bind(device).bind(e.start_time).bind(e.end_time).bind(e.state).bind(e.known_mask)
                .bind(e.active_mask).bind(settings_id).execute(&mut *tx).await?.last_insert_rowid()
        };
        sqlx::query("INSERT INTO afk_remote_intervals(device_uuid,source_id,interval_id,revision) VALUES (?,?,?,?)
            ON CONFLICT(device_uuid,source_id) DO UPDATE SET revision=excluded.revision")
            .bind(device).bind(e.id).bind(id).bind(e.revision).execute(&mut *tx).await?;
    }
    if let Some(revision) = page.iter().map(|e| e.revision).max() {
        sqlx::query("INSERT INTO afk_sync_cursors(device_uuid,download_revision) VALUES (?,?)
            ON CONFLICT(device_uuid) DO UPDATE SET download_revision=MAX(download_revision,excluded.download_revision)")
            .bind(device).bind(revision).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        afk::storage::{subtract, Interval},
        db::tables::log::Log,
    };

    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../migrations/0014_afk_evidence.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../migrations/0015_afk_sync.sql"))
            .execute(&pool)
            .await
            .unwrap();
        pool
    }
    fn evidence(id: i64, revision: i64, end_time: i64) -> Evidence {
        Evidence {
            id,
            revision,
            start_time: 120,
            end_time,
            state: 2,
            known_mask: 1,
            active_mask: 0,
            settings_json: "{}".into(),
        }
    }
    async fn intervals(pool: &SqlitePool) -> Vec<Interval> {
        sqlx::query_as("SELECT device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id FROM afk_intervals ORDER BY id").fetch_all(pool).await.unwrap()
    }
    fn log(device: &str) -> Log {
        Log {
            id: 1,
            device_uuid: Some(device.into()),
            app: "Editor".into(),
            timestamp: 100,
            duration: 100,
            is_deleted: false,
        }
    }

    #[tokio::test]
    async fn afk_download_hides_only_matching_device_and_handles_retries() {
        let pool = pool().await;
        import_page(&pool, "desktop", &[evidence(1, 1, 180)])
            .await
            .unwrap();
        import_page(&pool, "desktop", &[evidence(1, 1, 180)])
            .await
            .unwrap();
        let logs = vec![log("desktop"), log("phone")];
        let filtered = subtract(logs.clone(), &intervals(&pool).await);
        assert_eq!(
            filtered
                .iter()
                .filter(|l| l.device_uuid.as_deref() == Some("desktop"))
                .map(|l| (l.timestamp, l.duration))
                .collect::<Vec<_>>(),
            vec![(100, 20), (180, 20)]
        );
        assert_eq!(
            filtered
                .iter()
                .find(|l| l.device_uuid.as_deref() == Some("phone"))
                .unwrap()
                .duration,
            100
        );
        assert_eq!(logs[0].duration, 100);
        import_page(&pool, "desktop", &[evidence(1, 3, 200)])
            .await
            .unwrap();
        import_page(&pool, "desktop", &[evidence(1, 2, 190)])
            .await
            .unwrap();
        assert_eq!(intervals(&pool).await.len(), 1);
        assert_eq!(intervals(&pool).await[0].end_time, 200);
        assert_eq!(download_cursor(&pool, "desktop").await.unwrap(), 3);
        // Another device can use the same source ID without overwriting desktop.
        import_page(&pool, "phone", &[evidence(1, 4, 160)])
            .await
            .unwrap();
        assert_eq!(intervals(&pool).await.len(), 2);
        assert_eq!(download_cursor(&pool, "phone").await.unwrap(), 4);
        assert!(upload_page(&pool, "desktop", 0, 100)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn afk_download_cursor_and_rows_roll_back_together() {
        let pool = pool().await;
        let mut invalid = evidence(2, 2, 160);
        invalid.settings_json = "invalid".into();
        assert!(
            import_page(&pool, "desktop", &[evidence(1, 1, 180), invalid])
                .await
                .is_err()
        );
        assert!(intervals(&pool).await.is_empty());
        assert_eq!(download_cursor(&pool, "desktop").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn afk_upload_resends_extended_tail_without_imported_evidence() {
        let pool = pool().await;
        sqlx::query("INSERT INTO afk_configurations(settings_json) VALUES ('{}')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO afk_intervals(device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id) VALUES ('desktop',120,180,2,1,0,1)").execute(&pool).await.unwrap();
        let first = upload_page(&pool, "desktop", 0, 1).await.unwrap();
        acknowledge_upload(&pool, "desktop", first[0].id)
            .await
            .unwrap();
        sqlx::query("UPDATE afk_intervals SET end_time=200 WHERE id=1")
            .execute(&pool)
            .await
            .unwrap();
        let next = upload_page(
            &pool,
            "desktop",
            upload_cursor(&pool, "desktop").await.unwrap(),
            1,
        )
        .await
        .unwrap();
        assert_eq!((next[0].id, next[0].end_time), (1, 200));
        acknowledge_upload(&pool, "desktop", 0).await.unwrap();
        assert_eq!(upload_cursor(&pool, "desktop").await.unwrap(), 1);
    }
}
