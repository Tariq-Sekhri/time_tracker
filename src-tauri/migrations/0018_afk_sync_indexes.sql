-- Avoid full-table nested scans of afk_remote_intervals and afk_intervals during AFK sync.
CREATE INDEX IF NOT EXISTS idx_afk_remote_interval_id ON afk_remote_intervals(interval_id);
CREATE INDEX IF NOT EXISTS idx_afk_device_id ON afk_intervals(device_uuid, id);
