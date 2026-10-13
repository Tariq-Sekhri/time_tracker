-- Sidecar evidence only: activity logs and sync payloads are unchanged.
CREATE TABLE IF NOT EXISTS afk_configurations (
    id INTEGER PRIMARY KEY,
    settings_json TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS afk_intervals (
    id INTEGER PRIMARY KEY,
    device_uuid TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    state INTEGER NOT NULL,
    known_mask INTEGER NOT NULL,
    active_mask INTEGER NOT NULL,
    settings_id INTEGER NOT NULL REFERENCES afk_configurations(id)
);
CREATE INDEX IF NOT EXISTS idx_afk_device_time ON afk_intervals(device_uuid, start_time, end_time);
