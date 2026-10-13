-- Keep remote source IDs separate from local recorder IDs.
CREATE TABLE IF NOT EXISTS afk_remote_intervals (
    device_uuid TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    interval_id INTEGER NOT NULL REFERENCES afk_intervals(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    PRIMARY KEY(device_uuid, source_id)
);
CREATE TABLE IF NOT EXISTS afk_sync_cursors (
    device_uuid TEXT PRIMARY KEY,
    upload_id INTEGER NOT NULL DEFAULT 0,
    download_revision INTEGER NOT NULL DEFAULT 0
);
