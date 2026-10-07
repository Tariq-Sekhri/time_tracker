// SQL-only benchmark: never invokes sync or opens the installed app's database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { performance } = require('node:perf_hooks');

const sourcePath = path.join(process.env.APPDATA, 'time-tracker-dev', 'apptest.db');
assert(fs.existsSync(sourcePath), 'Start npm start to populate the isolated dev snapshot first');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'time-tracker-sync-benchmark-'));
const snapshotPath = path.join(directory, 'snapshot.db');
let source;
let copy;
try {
  source = new DatabaseSync(sourcePath, { readOnly: true });
  source.prepare('VACUUM INTO ?').run(snapshotPath);
  source.close();
  source = undefined;
  copy = new DatabaseSync(snapshotPath);
  const local = copy.prepare("SELECT uuid FROM devices WHERE kind = 'local' LIMIT 1").get();
  assert(local, 'Snapshot requires a local device');
  const query = 'SELECT * FROM logs WHERE is_deleted = 1 AND device_uuid = ? ORDER BY id ASC';
  copy.exec('DROP INDEX IF EXISTS idx_logs_deleted_device_id');
  const beforeStatement = copy.prepare(query);
  const beforeRows = beforeStatement.all(local.uuid);
  const beforePlan = copy.prepare(`EXPLAIN QUERY PLAN ${query}`).all(local.uuid).map(row => row.detail);
  const measure = (statement) => Array.from({ length: 10 }, () => {
    const start = performance.now();
    const rows = statement.all(local.uuid);
    assert.deepEqual(rows, beforeRows);
    return performance.now() - start;
  });
  const beforeMs = measure(beforeStatement);
  copy.exec('CREATE INDEX idx_logs_deleted_device_id ON logs(device_uuid, id) WHERE is_deleted = 1');
  const afterStatement = copy.prepare(query);
  const afterPlan = copy.prepare(`EXPLAIN QUERY PLAN ${query}`).all(local.uuid).map(row => row.detail);
  assert(afterPlan.some(detail => detail.includes('idx_logs_deleted_device_id')));
  afterStatement.all(local.uuid); // Warm the new prepared/index path before measuring.
  const afterMs = measure(afterStatement);
  const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const beforeAvgMs = average(beforeMs);
  const afterAvgMs = average(afterMs);
  const localCount = copy.prepare('SELECT COUNT(*) n FROM logs WHERE device_uuid = ?').get(local.uuid).n;
  console.log(JSON.stringify({
    scope: 'SQL-only deleted-log lookup on a separate copy of the isolated development snapshot',
    repeats: 10, localRows: localCount, deletedRows: beforeRows.length,
    fullRowParity: true, beforePlan, afterPlan, beforeMs, afterMs, beforeAvgMs, afterAvgMs,
    improvementPct: (1 - afterAvgMs / beforeAvgMs) * 100,
    speedup: beforeAvgMs / afterAvgMs,
  }, null, 2));
} finally {
  source?.close();
  copy?.close();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const target = `${snapshotPath}${suffix}`;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  fs.rmdirSync(directory);
}
