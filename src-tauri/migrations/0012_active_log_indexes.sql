-- Schema repair rebuilds logs around its composite key; restore window indexes
-- and keep deleted rows out of the two hot read paths.
CREATE INDEX IF NOT EXISTS idx_logs_active_timestamp ON logs(timestamp) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_logs_active_app_totals ON logs(app, timestamp, duration) WHERE is_deleted = 0;
