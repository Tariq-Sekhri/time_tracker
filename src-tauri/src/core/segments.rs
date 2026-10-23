//! Persist the current activity set atomically. A missing activity ends its segment.
use super::media::Activity;
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};

#[derive(Clone)]
struct Active {
    id: i64,
    name: String,
    last_seen: i64,
}

#[derive(Default)]
pub struct Segments {
    device: String,
    active: HashMap<String, Active>,
}

impl Segments {
    pub async fn clear(&mut self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        // These markers belong only to this desktop's single tracking supervisor.
        sqlx::query("DELETE FROM active_tracking_logs")
            .execute(pool)
            .await?;
        self.active.clear();
        Ok(())
    }

    pub async fn record(
        &mut self,
        pool: &SqlitePool,
        device: &str,
        now: i64,
        activities: &[Activity],
    ) -> Result<(), sqlx::Error> {
        let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
        sqlx::query("DELETE FROM active_tracking_logs")
            .execute(&mut *transaction)
            .await?;
        let mut next = HashMap::new();
        let mut names = HashSet::new();
        let mut created = Vec::new();
        for activity in activities {
            if !names.insert(&activity.name) {
                continue;
            }
            let existing = (self.device == device)
                .then(|| self.active.get(&activity.key))
                .flatten();
            if let Some(previous) =
                existing.filter(|previous| (0..=5).contains(&(now - previous.last_seen)))
            {
                let result = sqlx::query("UPDATE logs SET app = ?1, duration = duration + ?2 WHERE device_uuid = ?3 AND id = ?4 AND app = ?5 AND is_deleted = 0")
                    .bind(&activity.name).bind(now - previous.last_seen).bind(device).bind(previous.id).bind(&previous.name)
                    .execute(&mut *transaction).await?;
                if result.rows_affected() == 1 {
                    next.insert(
                        activity.key.clone(),
                        Active {
                            id: previous.id,
                            name: activity.name.clone(),
                            last_seen: now,
                        },
                    );
                    continue;
                }
            }
            let id: i64 = sqlx::query_scalar(
                "SELECT COALESCE(MAX(id), 0) + 1 FROM logs WHERE device_uuid = ?1",
            )
            .bind(device)
            .fetch_one(&mut *transaction)
            .await?;
            sqlx::query(
                "INSERT INTO logs (device_uuid, id, app, timestamp) VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(device)
            .bind(id)
            .bind(&activity.name)
            .bind(now)
            .execute(&mut *transaction)
            .await?;
            next.insert(
                activity.key.clone(),
                Active {
                    id,
                    name: activity.name.clone(),
                    last_seen: now,
                },
            );
            created.push(id);
        }
        for active in next.values() {
            sqlx::query("INSERT INTO active_tracking_logs (device_uuid, id) VALUES (?1, ?2)")
                .bind(device)
                .bind(active.id)
                .execute(&mut *transaction)
                .await?;
        }
        transaction.commit().await?;
        self.device = device.to_string();
        self.active = next;
        for id in created {
            crate::logger::Log::debug(format!("Tracking segment created id={id}"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::tables::log::create_table(&pool).await.unwrap();
        sqlx::raw_sql(include_str!(
            "../../migrations/0016_active_tracking_logs.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        pool
    }
    fn activity(key: &str, name: &str) -> Activity {
        Activity {
            key: key.into(),
            name: name.into(),
        }
    }
    async fn rows(pool: &SqlitePool) -> Vec<(i64, String, i64, i64)> {
        sqlx::query_as(
            "SELECT id, app, timestamp, duration FROM logs WHERE is_deleted = 0 ORDER BY id",
        )
        .fetch_all(pool)
        .await
        .unwrap()
    }
    #[tokio::test]
    async fn simultaneous_media_and_foreground_extend_without_duplicate_rows() {
        let pool = pool().await;
        let mut segments = Segments::default();
        let activities = [
            activity("media:1", "Song - Artist - Spotify"),
            activity("foreground", "Editor"),
        ];
        for now in 100..104 {
            segments
                .record(&pool, "local", now, &activities)
                .await
                .unwrap();
        }
        let rows = rows(&pool).await;
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|row| row.2 == 100 && row.3 == 3));
    }
    #[tokio::test]
    async fn learned_site_enriches_same_row_and_focus_does_not_split_media() {
        let pool = pool().await;
        let mut segments = Segments::default();
        segments
            .record(
                &pool,
                "local",
                100,
                &[activity("media", "Video - Artist - Vivaldi")],
            )
            .await
            .unwrap();
        let merged = activity("media", "Video - Artist - YouTube - Vivaldi");
        segments
            .record(&pool, "local", 101, &[merged.clone()])
            .await
            .unwrap();
        segments
            .record(
                &pool,
                "local",
                102,
                &[merged, activity("foreground", "Editor")],
            )
            .await
            .unwrap();
        let rows = rows(&pool).await;
        assert_eq!(rows.len(), 2);
        assert_eq!(
            rows[0],
            (1, "Video - Artist - YouTube - Vivaldi".into(), 100, 2)
        );
    }
    #[tokio::test]
    async fn pause_skip_and_tracking_suspend_do_not_fill_the_gap() {
        for suspend in [false, true] {
            let pool = pool().await;
            let mut segments = Segments::default();
            let media = [activity("media", "Song - Spotify")];
            segments.record(&pool, "local", 100, &media).await.unwrap();
            segments.record(&pool, "local", 101, &media).await.unwrap();
            if suspend {
                segments.clear(&pool).await.unwrap();
            } else {
                segments.record(&pool, "local", 102, &[]).await.unwrap();
            }
            segments.record(&pool, "local", 110, &media).await.unwrap();
            segments.record(&pool, "local", 111, &media).await.unwrap();
            let rows = rows(&pool).await;
            assert_eq!(rows.len(), 2);
            assert_eq!((rows[0].3, rows[1].2, rows[1].3), (1, 110, 1));
        }
    }
    #[tokio::test]
    async fn track_changes_sleep_and_clock_changes_start_new_segments() {
        let pool = pool().await;
        let mut segments = Segments::default();
        for (now, key) in [
            (100, "song1"),
            (101, "song1"),
            (102, "song2"),
            (200, "song2"),
            (50, "song2"),
        ] {
            segments
                .record(&pool, "local", now, &[activity(key, key)])
                .await
                .unwrap();
        }
        let rows = rows(&pool).await;
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].3, 1);
        assert!(rows.iter().all(|row| row.3 >= 0));
    }
    #[tokio::test]
    async fn identical_labels_are_only_written_once_and_deleted_rows_stay_deleted() {
        let pool = pool().await;
        let mut segments = Segments::default();
        let activities = [activity("one", "Same label"), activity("two", "Same label")];
        segments
            .record(&pool, "local", 100, &activities)
            .await
            .unwrap();
        assert_eq!(rows(&pool).await.len(), 1);
        sqlx::query("UPDATE logs SET is_deleted = 1")
            .execute(&pool)
            .await
            .unwrap();
        segments
            .record(&pool, "local", 101, &activities)
            .await
            .unwrap();
        assert_eq!(rows(&pool).await, vec![(2, "Same label".into(), 101, 0)]);
    }
    #[tokio::test]
    async fn device_change_does_not_update_another_devices_row() {
        let pool = pool().await;
        let mut segments = Segments::default();
        let media = [activity("media", "Song")];
        segments
            .record(&pool, "pending", 100, &media)
            .await
            .unwrap();
        segments
            .record(&pool, "registered", 101, &media)
            .await
            .unwrap();
        let rows = rows(&pool).await;
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|row| row.3 == 0));
    }
    #[tokio::test]
    async fn sync_waits_for_older_active_media_and_then_sends_final_duration_and_name() {
        let pool = pool().await;
        let mut segments = Segments::default();
        let mut media = activity("media", "Video - Artist - Vivaldi");
        segments
            .record(&pool, "local", 100, &[media.clone()])
            .await
            .unwrap();
        for now in 101..104 {
            segments
                .record(
                    &pool,
                    "local",
                    now,
                    &[media.clone(), activity(&format!("fg{now}"), "Editor")],
                )
                .await
                .unwrap();
        }
        assert!(crate::db::tables::log::logs_for_sync(&pool, "local", 0)
            .await
            .unwrap()
            .is_empty());
        media.name = "Video - Artist - YouTube - Vivaldi".into();
        segments
            .record(&pool, "local", 104, &[media])
            .await
            .unwrap();
        assert!(crate::db::tables::log::logs_for_sync(&pool, "local", 0)
            .await
            .unwrap()
            .is_empty());
        segments
            .record(&pool, "local", 105, &[activity("fg", "Editor")])
            .await
            .unwrap();
        let synced = crate::db::tables::log::logs_for_sync(&pool, "local", 0)
            .await
            .unwrap();
        assert_eq!(synced.len(), 4);
        assert_eq!(synced[0].app, "Video - Artist - YouTube - Vivaldi");
        assert_eq!(synced[0].duration, 4);
        assert!(crate::db::tables::log::logs_for_sync(&pool, "local", 4)
            .await
            .unwrap()
            .is_empty());
        // A crash/restart clears stale active markers without changing historical rows.
        segments.clear(&pool).await.unwrap();
        assert_eq!(rows(&pool).await.len(), 5);
    }
}
