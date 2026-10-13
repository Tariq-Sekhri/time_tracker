//! AFK is sidecar evidence, never a switch controlling activity logging.
pub(crate) mod storage;
pub(crate) mod sync;
#[cfg(target_os = "windows")]
mod windows;
pub use storage::{filter_logs, filter_requested};

use crate::db::{get_pool, tables::app_metadata_kv, Error};
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

pub const SOURCES: [&str; 11] = [
    "input",
    "mouse",
    "keyboard",
    "controller",
    "media",
    "foreground_media",
    "audio",
    "fullscreen",
    "locked",
    "screensaver",
    "video",
];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SourceSetting {
    pub enabled: bool,
    pub weight: u32,
    pub timeout_seconds: u32,
    pub absence_is_away: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AfkSettings {
    pub enabled: bool,
    pub minimum_sources: u32,
    pub away_threshold: u32,
    pub enter_delay_seconds: u32,
    pub exit_delay_seconds: u32,
    pub group_related_sources: bool,
    pub locked_is_away: bool,
    pub sources: Vec<SourceSetting>,
}
impl Default for AfkSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            minimum_sources: 1,
            away_threshold: 65,
            enter_delay_seconds: 30,
            exit_delay_seconds: 0,
            group_related_sources: true,
            locked_is_away: true,
            sources: SOURCES
                .iter()
                .enumerate()
                .map(|(i, _)| SourceSetting {
                    enabled: true,
                    weight: [60, 60, 60, 80, 90, 100, 20, 20, 100, 90, 100][i],
                    timeout_seconds: if i == 6 { 5 } else { 300 },
                    absence_is_away: i == 0,
                })
                .collect(),
        }
    }
}
impl AfkSettings {
    fn validate(&self) -> Result<(), Error> {
        if self.sources.len() != SOURCES.len()
            || !(1..=11).contains(&self.minimum_sources)
            || !(1..=100).contains(&self.away_threshold)
            || self.enter_delay_seconds > 3600
            || self.exit_delay_seconds > 3600
            || self
                .sources
                .iter()
                .any(|s| s.weight > 100 || !(1..=86400).contains(&s.timeout_seconds))
        {
            return Err(anyhow::anyhow!("Invalid AFK settings").into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Default)]
pub struct Observation {
    pub available: bool,
    pub active: bool,
    pub idle_seconds: Option<u64>,
    pub detail: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Decision {
    pub state: String,
    pub away_score: u32,
    pub agreeing_sources: u32,
    pub away_weight: u32,
    pub present_weight: u32,
    pub known_mask: u32,
    pub active_mask: u32,
}
pub fn evaluate(settings: &AfkSettings, observations: &[Observation]) -> Decision {
    let mut away = [0u32; 11];
    let mut present = [0u32; 11];
    let mut known_mask = 0;
    let mut active_mask = 0;
    let mut locked = false;
    for (i, (s, o)) in settings.sources.iter().zip(observations).enumerate() {
        if !o.available {
            continue;
        }
        known_mask |= 1 << i;
        let active = o
            .idle_seconds
            .map_or(o.active, |age| age < u64::from(s.timeout_seconds));
        if active {
            active_mask |= 1 << i;
        }
        if !s.enabled || s.weight == 0 {
            continue;
        }
        let group = if settings.group_related_sources {
            match i {
                0..=3 => 0,
                4..=6 | 10 => 4,
                _ => i,
            }
        } else {
            i
        };
        if i == 8 || i == 9 {
            if active {
                away[group] = away[group].max(s.weight);
                locked |= i == 8;
            }
        } else if active {
            present[group] = present[group].max(s.weight);
        } else if s.absence_is_away {
            away[group] = away[group].max(s.weight);
        }
    }
    // Within a correlated group, recent presence wins over an idle channel.
    for i in 0..11 {
        if present[i] > 0 {
            away[i] = 0;
        }
    }
    let away_weight = away.iter().sum::<u32>();
    let present_weight = present.iter().sum::<u32>();
    let agreeing_sources = away.iter().filter(|&&v| v > 0).count() as u32;
    let away_score = if away_weight + present_weight == 0 {
        0
    } else {
        away_weight * 100 / (away_weight + present_weight)
    };
    let state = if !settings.enabled || away_weight + present_weight == 0 {
        "unknown"
    } else if (settings.locked_is_away && locked)
        || (agreeing_sources >= settings.minimum_sources && away_score >= settings.away_threshold)
    {
        "afk"
    } else if present_weight > 0 {
        "present"
    } else {
        "unknown"
    };
    Decision {
        state: state.into(),
        away_score,
        agreeing_sources,
        away_weight,
        present_weight,
        known_mask,
        active_mask,
    }
}

#[derive(Default)]
pub struct Engine {
    state: String,
    candidate: String,
    since: i64,
    last_sample: i64,
}
impl Engine {
    pub fn update(&mut self, settings: &AfkSettings, mut decision: Decision, now: i64) -> Decision {
        if now < self.last_sample || now - self.last_sample > 5 {
            self.state.clear();
            self.candidate.clear();
        }
        self.last_sample = now;
        if decision.state == "unknown" {
            self.state = "unknown".into();
            self.candidate.clear();
        } else {
            if self.candidate != decision.state {
                self.candidate = decision.state.clone();
                self.since = now;
            }
            let delay = if decision.state == "afk" {
                settings.enter_delay_seconds
            } else {
                settings.exit_delay_seconds
            };
            if now - self.since >= i64::from(delay) {
                self.state = decision.state.clone();
            }
        }
        decision.state = if self.state.is_empty() {
            "unknown".into()
        } else {
            self.state.clone()
        };
        decision
    }
}

#[derive(Clone, Serialize)]
pub struct AfkStatus {
    pub timestamp: i64,
    pub observations: Vec<Observation>,
    pub decision: Decision,
    pub recording: bool,
    pub storage_error: Option<String>,
    #[serde(skip)]
    pub settings: AfkSettings,
}
fn latest() -> &'static Mutex<Option<AfkStatus>> {
    static LATEST: OnceLock<Mutex<Option<AfkStatus>>> = OnceLock::new();
    LATEST.get_or_init(|| Mutex::new(None))
}
fn config() -> &'static Mutex<AfkSettings> {
    static CONFIG: OnceLock<Mutex<AfkSettings>> = OnceLock::new();
    CONFIG.get_or_init(|| Mutex::new(AfkSettings::default()))
}
fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn start_collector() {
    static START: std::sync::Once = std::sync::Once::new();
    START.call_once(|| {
        std::thread::spawn(|| {
            #[cfg(target_os = "windows")]
            let mut collector = windows::Collector::new();
            let mut engine = Engine::default();
            let mut previous = AfkSettings::default();
            loop {
                let settings = config().lock().unwrap_or_else(|e| e.into_inner()).clone();
                if settings != previous {
                    engine = Engine::default();
                    previous = settings.clone();
                }
                #[cfg(target_os = "windows")]
                let observations = collector.collect();
                #[cfg(not(target_os = "windows"))]
                let observations = SOURCES
                    .iter()
                    .map(|_| Observation {
                        detail: "Not supported on this platform yet".into(),
                        ..Default::default()
                    })
                    .collect::<Vec<_>>();
                let timestamp = now();
                let decision =
                    engine.update(&settings, evaluate(&settings, &observations), timestamp);
                *latest().lock().unwrap_or_else(|e| e.into_inner()) = Some(AfkStatus {
                    timestamp,
                    observations,
                    decision,
                    recording: false,
                    storage_error: None,
                    settings,
                });
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        });
    });
}

#[tauri::command]
pub async fn get_afk_settings() -> Result<AfkSettings, Error> {
    let pool = get_pool().await?;
    let settings: AfkSettings =
        match app_metadata_kv::metadata_get(&pool, "afk_settings_v1").await? {
            Some(json) => serde_json::from_str(&json)?,
            None => AfkSettings::default(),
        };
    settings.validate()?;
    *config().lock().unwrap_or_else(|e| e.into_inner()) = settings.clone();
    Ok(settings)
}
#[tauri::command]
pub async fn set_afk_settings(settings: AfkSettings) -> Result<(), Error> {
    settings.validate()?;
    let pool = get_pool().await?;
    app_metadata_kv::metadata_set(&pool, "afk_settings_v1", &serde_json::to_string(&settings)?)
        .await?;
    *config().lock().unwrap_or_else(|e| e.into_inner()) = settings;
    Ok(())
}
#[tauri::command]
pub async fn get_afk_status() -> Result<Option<AfkStatus>, Error> {
    get_afk_settings().await?;
    start_collector();
    let mut status = latest().lock().unwrap_or_else(|e| e.into_inner()).clone();
    if let Some(s) = &mut status {
        s.recording = !cfg!(debug_assertions);
        s.storage_error = storage::last_error();
    }
    Ok(status)
}

pub async fn recorder() {
    if cfg!(debug_assertions) {
        return;
    }
    if let Err(e) = get_afk_settings().await {
        crate::logger::Log::error(format!("AFK settings: {e}"));
    }
    start_collector();
    let mut writer = storage::Writer::default();
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        let status = latest().lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Some(status) = status {
            // Failure is isolated: the activity supervisor never depends on this task.
            if let Err(e) = writer.write(&status).await {
                storage::set_error(Some(e.to_string()));
                crate::logger::Log::error(format!(
                    "AFK evidence write failed; activity logging continues: {e}"
                ));
            } else {
                storage::set_error(None);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn idle() -> Vec<Observation> {
        let mut o = vec![Observation::default(); 11];
        o[0] = Observation {
            available: true,
            idle_seconds: Some(600),
            ..Default::default()
        };
        o
    }
    #[test]
    fn watching_media_and_custom_weights() {
        let mut s = AfkSettings::default();
        let mut o = idle();
        assert_eq!(evaluate(&s, &o).state, "afk");
        o[4] = Observation {
            available: true,
            active: true,
            ..Default::default()
        };
        assert_eq!(evaluate(&s, &o).state, "present");
        s.sources[4].weight = 0;
        assert_eq!(evaluate(&s, &o).state, "afk");
    }
    #[test]
    fn unknown_is_not_a_vote_and_correlated_channels_count_once() {
        let mut s = AfkSettings::default();
        let mut o = idle();
        for i in [1, 2] {
            s.sources[i].absence_is_away = true;
            o[i] = o[0].clone();
        }
        s.minimum_sources = 2;
        assert_eq!(evaluate(&s, &o).state, "unknown");
        s.group_related_sources = false;
        assert_eq!(evaluate(&s, &o).state, "afk");
        assert_eq!(
            evaluate(&s, &vec![Observation::default(); 11]).state,
            "unknown"
        );
    }
    #[test]
    fn delays_and_sampling_gaps_never_backfill_away() {
        let s = AfkSettings::default();
        let mut engine = Engine::default();
        assert_eq!(
            engine.update(&s, evaluate(&s, &idle()), 100).state,
            "unknown"
        );
        for t in 101..130 {
            engine.update(&s, evaluate(&s, &idle()), t);
        }
        assert_eq!(engine.update(&s, evaluate(&s, &idle()), 130).state, "afk");
        assert_eq!(
            engine.update(&s, evaluate(&s, &idle()), 200).state,
            "unknown"
        );
    }
}
