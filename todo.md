- bug
    - change default to my settings
    - when adding regex default number should be 50 or 100 bigger then one below
    - dev mode tracking enabled
- ui
    - remove pie chart from calander rightsidebar (add a settings for on or off, default off)
    - add total time trend line
- speed up
    - detailed /trending
    - calendar
    - regex
- not planned
    - afk detection
    - macos

settings table

calendarStartHour: u8,
calendarHeight: u8,
rightSidebarWidth: u32,
minLogDuration: u32,
maxAttachDistance: u32,
lookaheadWindow: u32,
minDuration: u32
uiMinAppDuration: u32,
categorySidebarCount: u8,

"calendar_view_prefs_v1": {
"includeGoogleInStats": true,

"visibleCalendars": [
61,
64,
63
],
"knownCalendars": [
61,
64,
63
],
"googleCalendarsInStats": [
61,
63
],
"knownGoogleCalendarsInStats": [
61,
64,
63
]
}

#[derive(Debug, Serialize, FromRow, Deserialize)]
pub struct Category {
pub id: i32,
pub name: String,
pub priority: i32,
#[serde(default)]
pub color: Option<String>,
pub regex_enabled bool
pub calendar_enabled bool
}