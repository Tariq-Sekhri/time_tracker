"""Measure the shipped AFK schema in memory; optionally read production aggregates.

No database files are created or modified. Results describe synthetic evidence
change rates, not a claim about observed AFK frequency.
"""
import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "src-tauri/migrations/0014_afk_evidence.sql").read_text()
DEVICE = "00000000-0000-0000-0000-000000000001"


def allocated(connection):
    return connection.execute("SELECT SUM(pgsize) FROM dbstat").fetchone()[0]


def sidecar(seconds_per_change):
    connection = sqlite3.connect(":memory:")
    connection.executescript(SCHEMA)
    connection.execute("INSERT INTO afk_configurations VALUES (1,?)", (json.dumps({"sources": [{"enabled": True, "weight": 60, "timeout_seconds": 300, "absence_is_away": False}] * 11}),))
    connection.executemany("INSERT INTO afk_intervals(device_uuid,start_time,end_time,state,known_mask,active_mask,settings_id) VALUES (?,?,?,?,?,?,1)",
                           ((DEVICE, 1791849600 + t, 1791849600 + min(86400, t + seconds_per_change), 1 if i % 2 else 2, 2047, 1 if i % 2 else 0)
                            for i, t in enumerate(range(0, 86400, seconds_per_change))))
    result = {"seconds_per_change": seconds_per_change, "intervals_per_day": connection.execute("SELECT COUNT(*) FROM afk_intervals").fetchone()[0], "allocated_bytes": allocated(connection)}
    connection.close()
    return result


def activity_flag_size(flag):
    connection = sqlite3.connect(":memory:")
    extra = ",afk INTEGER NOT NULL DEFAULT 0" if flag else ""
    connection.execute(f"CREATE TABLE logs(id INTEGER,device_uuid TEXT,app TEXT,timestamp INTEGER,duration INTEGER{extra},PRIMARY KEY(device_uuid,id))")
    connection.executemany("INSERT INTO logs VALUES (?,?,?,?,?" + (",?" if flag else "") + ")",
                           ((i, DEVICE, "Example foreground window - Browser", 1791849600+i*10, 10) + ((i % 2,) if flag else ()) for i in range(100000)))
    size = allocated(connection)
    connection.close()
    return size


parser = argparse.ArgumentParser()
parser.add_argument("--read-production", type=Path)
args = parser.parse_args()
result = {"synthetic_24_hour_sidecar": [sidecar(step) for step in (86400,300,30,5,1)],
          "boolean_flag_comparison_100000_activity_rows": {"without_flag_bytes": activity_flag_size(False), "with_flag_bytes": activity_flag_size(True)}}
if args.read_production:
    connection = sqlite3.connect(args.read_production.resolve().as_uri() + "?mode=ro", uri=True)
    connection.execute("PRAGMA query_only=ON")
    count, total, start, end = connection.execute("SELECT COUNT(*),SUM(duration),MIN(timestamp),MAX(timestamp) FROM logs").fetchone()
    result["read_only_production_snapshot"] = {"activity_rows": count, "recorded_seconds": total, "first_timestamp": start, "last_timestamp": end, "database_file_bytes": args.read_production.stat().st_size}
    connection.close()
print(json.dumps(result, indent=2))
