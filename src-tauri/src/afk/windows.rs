//! No key contents, screenshots, microphone, or media titles are collected.
use super::Observation;
use std::time::Instant;
use windows::{
    Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as MediaManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    },
    Win32::{
        Foundation::{HANDLE, POINT, RECT},
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        Media::Audio::{
            eMultimedia, eRender, Endpoints::IAudioMeterInformation, IMMDeviceEnumerator,
            MMDeviceEnumerator,
        },
        System::{
            Com::{CoCreateInstance, CLSCTX_ALL},
            StationsAndDesktops::{
                CloseDesktop, GetUserObjectInformationW, OpenInputDesktop, DESKTOP_CONTROL_FLAGS,
                DESKTOP_READOBJECTS, UOI_NAME,
            },
            SystemInformation::GetTickCount,
            WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
        },
        UI::{
            Input::{
                KeyboardAndMouse::{GetAsyncKeyState, GetLastInputInfo, LASTINPUTINFO},
                XboxController::{XInputGetState, XINPUT_STATE},
            },
            WindowsAndMessaging::{
                GetCursorPos, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId,
                SystemParametersInfoW, SPI_GETSCREENSAVERRUNNING,
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
            },
        },
    },
};

pub struct Collector {
    cursor: Option<(i32, i32)>,
    mouse: Option<Instant>,
    keyboard: Option<Instant>,
    controller: Option<Instant>,
    packets: [Option<u32>; 4],
    media: Option<MediaManager>,
    media_error: String,
    ticks: u32,
    audio: Option<Instant>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Read-only live Windows evidence probe; run explicitly"]
    fn live_afk_channels() {
        let mut collector = Collector::new();
        let observations = collector.collect();
        println!("{}", serde_json::to_string(&observations).unwrap());
        assert_eq!(observations.len(), 11);
        assert!(
            observations[0].available,
            "Windows session input timer should be readable"
        );
    }
}
fn recent(time: Option<Instant>, detail: &str) -> Observation {
    Observation {
        available: time.is_some(),
        active: false,
        idle_seconds: time.map(|t| t.elapsed().as_secs()),
        detail: detail.into(),
    }
}
fn flag(active: bool, detail: impl Into<String>) -> Observation {
    Observation {
        available: true,
        active,
        idle_seconds: None,
        detail: detail.into(),
    }
}
fn unavailable(detail: impl Into<String>) -> Observation {
    Observation {
        detail: detail.into(),
        ..Default::default()
    }
}
impl Collector {
    pub fn new() -> Self {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        Self {
            cursor: None,
            mouse: None,
            keyboard: None,
            controller: None,
            packets: [None; 4],
            media: None,
            media_error: String::new(),
            ticks: 0,
            audio: None,
        }
    }
    pub fn collect(&mut self) -> Vec<Observation> {
        self.ticks = self.ticks.wrapping_add(1);
        let mut output = vec![Observation::default(); 11];
        unsafe {
            let mut input = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            output[0] = if GetLastInputInfo(&mut input).as_bool() {
                Observation {
                    available: true,
                    active: false,
                    idle_seconds: Some(u64::from(GetTickCount().wrapping_sub(input.dwTime)) / 1000),
                    detail: "Windows session input timer".into(),
                }
            } else {
                unavailable("Windows input timer unavailable")
            };
            let mut point = POINT::default();
            let cursor_ok = GetCursorPos(&mut point).is_ok();
            if cursor_ok {
                let position = (point.x, point.y);
                if self.cursor.is_some_and(|previous| previous != position)
                    || [1, 2, 4, 5, 6].iter().any(|&key| GetAsyncKeyState(key) < 0)
                {
                    self.mouse = Some(Instant::now());
                }
                self.cursor = Some(position);
            }
            if (8..=254).any(|key| GetAsyncKeyState(key) < 0) {
                self.keyboard = Some(Instant::now());
            }
            output[1] = if cursor_ok {
                recent(
                    self.mouse,
                    "Mouse motion/buttons; waiting for observation until used",
                )
            } else {
                unavailable("Cursor unavailable")
            };
            output[2] = recent(
                self.keyboard,
                "Key-down presence sampled once per second; short taps may be missed",
            );
            let mut connected = false;
            for i in 0..4 {
                let mut state = XINPUT_STATE::default();
                if XInputGetState(i as u32, &mut state) == 0 {
                    connected = true;
                    let g = state.Gamepad;
                    let intentional = g.wButtons.0 != 0
                        || g.bLeftTrigger > 30
                        || g.bRightTrigger > 30
                        || i32::from(g.sThumbLX).abs() > 7849
                        || i32::from(g.sThumbLY).abs() > 7849
                        || i32::from(g.sThumbRX).abs() > 8689
                        || i32::from(g.sThumbRY).abs() > 8689;
                    if intentional && self.packets[i] != Some(state.dwPacketNumber) {
                        self.controller = Some(Instant::now());
                    }
                    self.packets[i] = Some(state.dwPacketNumber);
                } else {
                    self.packets[i] = None;
                }
            }
            output[3] = if connected {
                recent(self.controller, "XInput controllers, with stick dead zones")
            } else {
                unavailable("No XInput controller connected")
            };
            let hwnd = GetForegroundWindow();
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let foreground = crate::core::windows::query_process_path(pid)
                .unwrap_or_default()
                .rsplit('\\')
                .next()
                .unwrap_or("")
                .to_lowercase();
            let foreground = foreground.strip_suffix(".exe").unwrap_or(&foreground);
            if self.media.is_none() && (self.ticks == 1 || self.ticks % 30 == 0) {
                match MediaManager::RequestAsync().and_then(|op| {
                    let deadline = Instant::now() + std::time::Duration::from_secs(2);
                    while op.Status()? == windows_future::AsyncStatus::Started
                        && Instant::now() < deadline
                    {
                        std::thread::sleep(std::time::Duration::from_millis(20));
                    }
                    op.GetResults()
                }) {
                    Ok(manager) => {
                        self.media = Some(manager);
                        self.media_error.clear();
                    }
                    Err(e) => self.media_error = format!("Media sessions unavailable: {e}"),
                }
            }
            let playback = self.media.as_ref().map(
                |manager| -> windows::core::Result<(bool, bool, Option<bool>)> {
                    let sessions = manager.GetSessions()?;
                    let mut playing = false;
                    let mut in_foreground = false;
                    let mut video = false;
                    let mut unknown_type = false;
                    for i in 0..sessions.Size()? {
                        let session = sessions.GetAt(i)?;
                        if session.GetPlaybackInfo()?.PlaybackStatus()? == PlaybackStatus::Playing {
                            playing = true;
                            match session
                                .GetPlaybackInfo()?
                                .PlaybackType()
                                .and_then(|kind| kind.Value())
                            {
                                Ok(kind) => {
                                    video |= kind == windows::Media::MediaPlaybackType::Video
                                }
                                Err(_) => unknown_type = true,
                            }
                            let source = session.SourceAppUserModelId()?.to_string().to_lowercase();
                            if !foreground.is_empty()
                                && (source == foreground
                                    || source == format!("{foreground}.exe")
                                    || source.starts_with(&format!("{foreground}_")))
                            {
                                in_foreground = true;
                            }
                        }
                    }
                    Ok((
                        playing,
                        in_foreground,
                        if video {
                            Some(true)
                        } else if unknown_type {
                            None
                        } else {
                            Some(false)
                        },
                    ))
                },
            );
            match playback {
                Some(Ok((playing, foreground, video))) => {
                    output[4] = flag(playing, "Windows media session reports Playing");
                    output[5]=flag(foreground,"Playing session matches foreground executable; browser tab visibility is unknown");
                    output[10] = video.map_or_else(
                        || unavailable("Playing session does not expose audio/video type"),
                        |active| flag(active, "Media session reports video playback"),
                    );
                }
                Some(Err(e)) => {
                    self.media = None;
                    self.media_error = e.to_string();
                    for i in [4, 5, 10] {
                        output[i] = unavailable(&self.media_error);
                    }
                }
                None => {
                    for i in [4, 5, 10] {
                        output[i] = unavailable(&self.media_error);
                    }
                }
            }
            let audio = (|| -> windows::core::Result<bool> {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
                let endpoint = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
                let meter: IAudioMeterInformation = endpoint.Activate(CLSCTX_ALL, None)?;
                Ok(meter.GetPeakValue()? > 0.001)
            })();
            output[6] = match audio {
                Ok(active) => {
                    if active {
                        self.audio = Some(Instant::now());
                    }
                    Observation {
                        available: true,
                        active: false,
                        idle_seconds: self.audio.map(|time| time.elapsed().as_secs()),
                        detail: "Time since output amplitude; no audio recorded".into(),
                    }
                }
                Err(e) => unavailable(format!("Output meter: {e}")),
            };
            let mut rect = RECT::default();
            let mut monitor = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            output[7] = if !hwnd.is_invalid()
                && GetWindowRect(hwnd, &mut rect).is_ok()
                && GetMonitorInfoW(
                    MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST),
                    &mut monitor,
                )
                .as_bool()
            {
                flag(rect.left<=monitor.rcMonitor.left && rect.top<=monitor.rcMonitor.top && rect.right>=monitor.rcMonitor.right && rect.bottom>=monitor.rcMonitor.bottom,
                    "Foreground window covers its monitor; fullscreen alone does not prove presence")
            } else {
                unavailable("Foreground window geometry unavailable")
            };
            output[8] = match OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS)
            {
                Ok(desktop) => {
                    let mut name = [0u16; 128];
                    let read = GetUserObjectInformationW(
                        HANDLE(desktop.0),
                        UOI_NAME,
                        Some(name.as_mut_ptr().cast()),
                        (name.len() * 2) as u32,
                        None,
                    );
                    let _ = CloseDesktop(desktop);
                    if read.is_ok() {
                        let length = name.iter().position(|&c| c == 0).unwrap_or(name.len());
                        flag(
                            String::from_utf16_lossy(&name[..length])
                                .eq_ignore_ascii_case("winlogon"),
                            "Input desktop lock state",
                        )
                    } else {
                        unavailable("Input desktop name unavailable")
                    }
                }
                Err(_) => unavailable("Input desktop inaccessible; lock state unknown"),
            };
            let mut running = 0i32;
            output[9] = if SystemParametersInfoW(
                SPI_GETSCREENSAVERRUNNING,
                0,
                Some((&mut running as *mut i32).cast()),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
            .is_ok()
            {
                flag(running != 0, "Windows screensaver state")
            } else {
                unavailable("Screensaver state unavailable")
            };
        }
        // WTS exposes the lock flag even when the secure input desktop cannot
        // be opened. Never interpret a failed API call as a confirmed lock.
        unsafe {
            use windows::{core::PWSTR, Win32::System::RemoteDesktop::*};
            let mut buffer = PWSTR::null();
            let mut bytes = 0;
            if WTSQuerySessionInformationW(
                None,
                WTS_CURRENT_SESSION,
                WTSSessionInfoEx,
                &mut buffer,
                &mut bytes,
            )
            .is_ok()
            {
                if bytes as usize >= std::mem::size_of::<WTSINFOEXW>() && !buffer.is_null() {
                    let info = &*buffer.0.cast::<WTSINFOEXW>();
                    if info.Level == 1 {
                        let flags = info.Data.WTSInfoExLevel1.SessionFlags;
                        if flags == 0 || flags == 1 {
                            output[8] = flag(flags == 0, "Windows session lock flag");
                        }
                    }
                }
                WTSFreeMemory(buffer.0.cast());
            }
        }
        output
    }
}
