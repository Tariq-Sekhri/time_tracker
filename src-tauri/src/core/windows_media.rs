//! Read-only Windows media sampling. The caller runs this on a blocking worker.
use super::media::Playback;
use std::time::{Duration, Instant};
use windows::{
    core::{RuntimeType, HSTRING},
    Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    },
    Win32::{
        System::{
            Com::CoTaskMemFree,
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
        UI::Shell::{IShellItem, SHCreateItemFromParsingName, SIGDN_NORMALDISPLAY},
    },
};

fn wait<T: RuntimeType>(operation: windows_future::IAsyncOperation<T>) -> windows::core::Result<T> {
    let deadline = Instant::now() + Duration::from_secs(2);
    while operation.Status()? == windows_future::AsyncStatus::Started {
        if Instant::now() >= deadline {
            let _ = operation.Cancel();
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x800705B4u32 as i32),
                "Media query timed out",
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    operation.GetResults()
}

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            RoUninitialize();
        }
    }
}

#[derive(Default)]
pub struct Collector {
    manager: Option<Manager>,
    names: std::collections::HashMap<String, String>,
}

pub struct Snapshot {
    pub sessions: Vec<Playback>,
    pub errors: Vec<String>,
}

impl Collector {
    pub fn collect(&mut self) -> windows::core::Result<Snapshot> {
        unsafe {
            RoInitialize(RO_INIT_MULTITHREADED)?;
        }
        let _apartment = Apartment;
        if self.manager.is_none() {
            self.manager = Some(wait(Manager::RequestAsync()?)?);
        }
        let sessions = match self.manager.as_ref().unwrap().GetSessions() {
            Ok(sessions) => sessions,
            Err(error) => {
                self.manager = None;
                return Err(error);
            }
        };
        let mut snapshot = Snapshot {
            sessions: Vec::new(),
            errors: Vec::new(),
        };
        for session in sessions {
            let result = (|| -> windows::core::Result<Playback> {
                let source = session.SourceAppUserModelId()?.to_string();
                let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing;
                let metadata = wait(session.TryGetMediaPropertiesAsync()?)?;
                let app_name = self
                    .names
                    .entry(source.clone())
                    .or_insert_with(|| display_name(&source))
                    .clone();
                Ok(Playback {
                    source,
                    app_name,
                    title: metadata.Title()?.to_string(),
                    artist: metadata.Artist()?.to_string(),
                    playing,
                })
            })();
            match result {
                Ok(playback) => snapshot.sessions.push(playback),
                Err(error) => snapshot.errors.push(error.to_string()),
            }
        }
        Ok(snapshot)
    }
}

fn display_name(source: &str) -> String {
    // These apps publish browser/profile IDs rather than their display names.
    let lower = source.to_lowercase();
    if lower.contains("youtube_music_desktop_app") {
        return "YouTube Music Desktop".into();
    }
    for (prefix, name) in [
        ("vivaldi.", "Vivaldi"),
        ("chrome.", "Chrome"),
        ("msedge.", "Microsoft Edge"),
        ("firefox.", "Firefox"),
        ("brave.", "Brave"),
        ("spotify", "Spotify"),
    ] {
        if lower.starts_with(prefix) {
            return name.into();
        }
    }
    unsafe {
        let path = HSTRING::from(format!("shell:AppsFolder\\{source}"));
        if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&path, None) {
            if let Ok(value) = item.GetDisplayName(SIGDN_NORMALDISPLAY) {
                let name = value.to_string().ok();
                CoTaskMemFree(Some(value.0.cast()));
                if let Some(name) = name.filter(|name| !name.trim().is_empty()) {
                    return name;
                }
            }
        }
    }
    source
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(source)
        .trim_end_matches(".exe")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn friendly_source_names() {
        assert_eq!(
            display_name("Vivaldi.WDSPCQBOXR4CXY7A3VVEPATZ7M"),
            "Vivaldi"
        );
        assert_eq!(
            display_name("com.squirrel.youtube_music_desktop_app.youtube-music-desktop-app"),
            "YouTube Music Desktop"
        );
    }
    #[tokio::test]
    #[ignore = "Live Windows read; writes only to an in-memory test database; run explicitly"]
    async fn live_media_foreground_selection() {
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
        let mut collector = Collector::default();
        let mut selector = super::super::media::Selector::default();
        let mut segments = super::super::segments::Segments::default();
        for tick in 0..3 {
            let snapshot = collector.collect().expect("Windows media sessions");
            assert!(snapshot.errors.is_empty(), "{:?}", snapshot.errors);
            let foreground = crate::core::windows::get_foreground_snapshot().unwrap();
            let activities = selector.select(&foreground, &snapshot.sessions);
            if tick == 0 {
                println!("Foreground: {}", foreground.name);
                for session in &snapshot.sessions {
                    println!(
                        "Media: {} - {} - {} ({})",
                        session.title,
                        session.artist,
                        session.app_name,
                        if session.playing {
                            "Playing"
                        } else {
                            "Not Playing"
                        }
                    );
                }
                for activity in &activities {
                    println!("Selected log: {}", activity.name);
                }
            }
            segments
                .record(&pool, "live-test-only", 100 + tick, &activities)
                .await
                .unwrap();
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        let rows: Vec<(String, i64)> = sqlx::query_as("SELECT app, duration FROM logs ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
        println!("Persisted test-only logs: {rows:?}");
        assert!(!rows.is_empty());
    }
}
