- High
    - cross device sync
    - manual time tracking
- low
    - trend explain
    - right click app regex give u the regex that sorted it
    - remove pie chart from calander rightsidebar (add a settings for on or off, default off)
    - speedups
        - detailed /trending
        - calendar
        - regex
- not planned
    - afk detection
    - macos

struct and tables

```Rust
enum DeviceState {
    Us(token),
    IsTracking(bool)
}

struct Devices {
    uuid: String,
    name: String,
    state: DeviceState,
    last_sync_id: i64,
}

struct Log {
    id: i64,
    //default none
    device_uuid: Option<String>,
    app: String,
    timestamp: i64,
    duration: i64
}

```

appmetadata key = deleted_log_ids = vec<i64>