ALTER TABLE logs ADD COLUMN device_uuid TEXT NOT NULL DEFAULT '';

UPDATE logs
SET device_uuid = (
  SELECT d.uuid FROM devices d WHERE d.id = logs.device_id
)
WHERE device_id != 0
  AND EXISTS (SELECT 1 FROM devices d WHERE d.id = logs.device_id);
