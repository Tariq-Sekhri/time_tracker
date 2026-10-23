-- Hold the sync cursor behind every unfinished foreground/media segment.
CREATE TABLE IF NOT EXISTS active_tracking_logs (
    device_uuid TEXT NOT NULL,
    id INTEGER NOT NULL,
    PRIMARY KEY (device_uuid, id)
);
