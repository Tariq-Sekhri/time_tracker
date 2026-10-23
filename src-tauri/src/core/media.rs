//! Selection and naming only: foreground and media observations become one set of activities.
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Activity {
    pub key: String,
    pub name: String,
}

#[derive(Clone, Debug, Default)]
pub struct Foreground {
    pub name: String,
    pub title: String,
    pub executable: String,
    pub app_name: String,
}

#[derive(Clone, Debug)]
pub struct Playback {
    pub source: String,
    pub app_name: String,
    pub title: String,
    pub artist: String,
    pub playing: bool,
}

impl Playback {
    fn key(&self) -> String {
        // Length prefixes avoid collisions when titles contain our label separators.
        format!(
            "media:{}:{}{}:{}{}:{}",
            self.source.len(),
            self.source,
            self.title.len(),
            self.title,
            self.artist.len(),
            self.artist
        )
    }
}

fn normalized(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn same_app(foreground: &Foreground, playback: &Playback) -> bool {
    let executable = foreground.executable.to_lowercase();
    let executable = executable.strip_suffix(".exe").unwrap_or(&executable);
    let source = playback.source.to_lowercase();
    (!executable.is_empty()
        && (source == executable
            || source == format!("{executable}.exe")
            || source.starts_with(&format!("{executable}."))
            || source.ends_with(&format!(".{executable}"))
            || source.rsplit('!').next() == Some(executable)))
        || (!normalized(&foreground.app_name).is_empty()
            && normalized(&foreground.app_name) == normalized(&playback.app_name))
}

const SEPARATORS: [&str; 4] = [" - ", " | ", " — ", " – "];

fn title_suffix<'a>(window_title: &'a str, media_title: &str) -> Option<&'a str> {
    let title = window_title.trim();
    // Browser notification counts are not part of the media's name.
    let unbadged = title
        .strip_prefix('(')
        .and_then(|rest| rest.split_once(") "))
        .filter(|(count, _)| !count.is_empty() && count.chars().all(|c| c.is_ascii_digit()))
        .map(|(_, title)| title);
    let suffix = title
        .strip_prefix(media_title.trim())
        .or_else(|| unbadged.and_then(|title| title.strip_prefix(media_title.trim())))?;
    if suffix.is_empty()
        || SEPARATORS
            .iter()
            .any(|separator| suffix.starts_with(separator))
    {
        Some(suffix)
    } else {
        None
    }
}

fn browser(executable: &str) -> bool {
    matches!(
        executable.to_lowercase().trim_end_matches(".exe"),
        "vivaldi" | "chrome" | "msedge" | "firefox" | "brave" | "opera" | "chromium" | "arc"
    )
}

fn site_context(suffix: &str, foreground: &Foreground, playback: &Playback) -> String {
    if !browser(&foreground.executable) {
        return String::new();
    }
    let mut parts = vec![suffix.to_string()];
    for separator in SEPARATORS {
        parts = parts
            .iter()
            .flat_map(|part| part.split(separator).map(str::to_string))
            .collect();
    }
    let excluded = [
        &foreground.executable,
        &foreground.app_name,
        &playback.app_name,
        &playback.artist,
    ];
    let mut seen = HashSet::new();
    parts
        .into_iter()
        .map(|part| part.trim().to_string())
        .filter(|part| {
            !part.is_empty()
                && !excluded
                    .iter()
                    .any(|name| normalized(part) == normalized(name))
        })
        .filter(|part| seen.insert(normalized(part)))
        .collect::<Vec<_>>()
        .join(" - ")
}

#[derive(Default)]
pub struct Selector {
    contexts: HashMap<String, String>,
}

impl Selector {
    pub fn clear(&mut self) {
        self.contexts.clear();
    }

    pub fn select(&mut self, foreground: &Foreground, sessions: &[Playback]) -> Vec<Activity> {
        let known: HashSet<_> = sessions.iter().map(Playback::key).collect();
        self.contexts.retain(|key, _| known.contains(key));
        let mut matching_foreground = false;
        let mut activities = Vec::new();
        let mut names = HashSet::new();
        // Stable ordering prevents identical duplicate observations from changing the row owner.
        let mut sessions: Vec<_> = sessions.iter().collect();
        sessions.sort_by_key(|session| session.key());
        for session in sessions {
            if !session.playing || session.title.trim().is_empty() {
                continue;
            }
            let key = session.key();
            if same_app(foreground, session) {
                if let Some(suffix) = title_suffix(&foreground.title, &session.title) {
                    matching_foreground = true;
                    let context = site_context(suffix, foreground, session);
                    if !context.is_empty() {
                        self.contexts.insert(key.clone(), context);
                    }
                }
            }
            let context = self.contexts.get(&key).map(String::as_str).unwrap_or("");
            let name = [
                session.title.trim(),
                session.artist.trim(),
                context,
                session.app_name.trim(),
            ]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" - ");
            if names.insert(name.clone()) {
                activities.push(Activity { key, name });
            }
        }
        if !matching_foreground
            && !foreground.name.is_empty()
            && names.insert(foreground.name.clone())
        {
            activities.push(Activity {
                key: format!("foreground:{}", foreground.name),
                name: foreground.name.clone(),
            });
        }
        activities
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notification_badges_do_not_duplicate_media() {
        let mut fg = youtube();
        fg.title = format!("(3) {}", fg.title);
        fg.name = fg.title.clone();
        assert_eq!(Selector::default().select(&fg, &[video()]).len(), 1);
    }
    #[test]
    fn pause_resume_keeps_learned_site_but_does_not_select_paused_media() {
        let mut selector = Selector::default();
        let initial = selector.select(&youtube(), &[video()])[0].clone();
        let mut paused = video();
        paused.playing = false;
        let editor = foreground("Editor", "editor.exe");
        assert_eq!(selector.select(&editor, &[paused]).len(), 1);
        assert!(selector.select(&editor, &[video()]).contains(&initial));
    }
    fn video() -> Playback {
        Playback {
            source: "Vivaldi.PROFILE".into(),
            app_name: "Vivaldi".into(),
            title: "Learning from the CRAZIEST PILOT in WARDOGS...".into(),
            artist: "Silk".into(),
            playing: true,
        }
    }
    fn foreground(title: &str, exe: &str) -> Foreground {
        Foreground {
            name: title.into(),
            title: title.into(),
            executable: exe.into(),
            app_name: exe.trim_end_matches(".exe").into(),
        }
    }
    fn youtube() -> Foreground {
        foreground(
            "Learning from the CRAZIEST PILOT in WARDOGS... - YouTube - Vivaldi",
            "vivaldi.exe",
        )
    }
    #[test]
    fn merges_live_youtube_example_and_keeps_context_in_background() {
        let mut selector = Selector::default();
        let selected = selector.select(&youtube(), &[video()]);
        assert_eq!(selected.len(), 1);
        assert_eq!(
            selected[0].name,
            "Learning from the CRAZIEST PILOT in WARDOGS... - Silk - YouTube - Vivaldi"
        );
        let background = selector.select(&foreground("Editor", "editor.exe"), &[video()]);
        assert!(background.contains(&selected[0]));
        assert_eq!(background.len(), 2);
    }
    #[test]
    fn other_tab_and_other_app_with_same_title_are_not_suppressed() {
        for fg in [
            foreground("Another video - YouTube - Vivaldi", "vivaldi.exe"),
            foreground(&youtube().title, "editor.exe"),
        ] {
            assert_eq!(Selector::default().select(&fg, &[video()]).len(), 2);
        }
        let mut same_prefix = video();
        same_prefix.title = "Learning".into();
        assert_eq!(
            Selector::default().select(&youtube(), &[same_prefix]).len(),
            2
        );
    }
    #[test]
    fn paused_media_is_not_logged_and_foreground_still_is() {
        let mut paused = video();
        paused.playing = false;
        let selected = Selector::default().select(&youtube(), &[paused]);
        assert_eq!(
            selected,
            vec![Activity {
                key: format!("foreground:{}", youtube().name),
                name: youtube().name
            }]
        );
    }
    #[test]
    fn skips_missing_artist_and_deduplicates_repeated_sessions() {
        let mut video = video();
        video.artist.clear();
        let selected = Selector::default().select(&youtube(), &[video.clone(), video]);
        assert_eq!(selected.len(), 1);
        assert_eq!(
            selected[0].name,
            "Learning from the CRAZIEST PILOT in WARDOGS... - YouTube - Vivaldi"
        );
    }
    #[test]
    fn multiple_playing_apps_are_logged_but_paused_song_is_excluded() {
        let mut song = Playback {
            source: "Spotify.exe".into(),
            app_name: "Spotify".into(),
            title: "Song".into(),
            artist: "Artist".into(),
            playing: true,
        };
        let mut selector = Selector::default();
        assert_eq!(
            selector.select(&youtube(), &[video(), song.clone()]).len(),
            2
        );
        song.playing = false;
        assert_eq!(selector.select(&youtube(), &[video(), song]).len(), 1);
    }
    #[test]
    fn context_does_not_leak_to_a_different_track_or_disconnected_session() {
        let mut selector = Selector::default();
        selector.select(&youtube(), &[video()]);
        let mut next = video();
        next.title = "New video".into();
        let rows = selector.select(&foreground("Editor", "editor.exe"), &[next]);
        assert_eq!(rows[0].name, "New video - Silk - Vivaldi");
        let rows = selector.select(&foreground("Editor", "editor.exe"), &[video()]);
        assert!(!rows[0].name.contains("YouTube"));
    }
    #[test]
    fn tms_context_and_native_music_names() {
        let mut video = video();
        video.title = "The Boys Season 4".into();
        video.artist.clear();
        let rows = Selector::default().select(
            &foreground("The Boys Season 4 - TMS - Vivaldi", "vivaldi.exe"),
            &[video],
        );
        assert_eq!(rows[0].name, "The Boys Season 4 - TMS - Vivaldi");
        let song = Playback {
            source: "com.squirrel.youtube_music_desktop_app.youtube-music-desktop-app".into(),
            app_name: "YouTube Music Desktop".into(),
            title: "Long Song".into(),
            artist: "Artist".into(),
            playing: true,
        };
        let fg = foreground(
            "Long Song | YouTube Music | YouTube Music Desktop App",
            "youtube-music-desktop-app.exe",
        );
        let rows = Selector::default().select(&fg, &[song]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "Long Song - Artist - YouTube Music Desktop");
    }
}
