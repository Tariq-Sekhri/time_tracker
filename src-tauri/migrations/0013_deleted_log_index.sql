-- Sync looks for a handful of tombstones among the full local-device history.
CREATE INDEX IF NOT EXISTS idx_logs_deleted_device_id ON logs(device_uuid, id) WHERE is_deleted = 1;
