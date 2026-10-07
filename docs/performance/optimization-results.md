# Time Tracker 1.11.8 performance results

Measured October 7, 2026. The installed production application was left running. Its database was opened read-only to create an isolated development snapshot. All migrations, benchmarks, UI interactions, and test writes used development or temporary databases.

## Matched backend comparison

The frozen implementation at `2c2c7706d6633aefbd3759a19640dbfdb22f6d05` and the optimized implementation run in the same optimized Rust `performance` profile, with development isolation enabled. The snapshot contains 308,679 active logs. Statistics results use three repetitions; calendar results use five week anchors. Serialized output parity is checked, including filtered devices, manual time, and calendar merging. The legacy full-history reader explicitly uses `NOT INDEXED` to reproduce the original installed schema's access path.

| Area | Before, mean | After, mean | Time reduction |
| --- | ---: | ---: | ---: |
| Calendar week | 1,035 ms | 179 ms | 82.70% |
| Weekly statistics | 950 ms | 127 ms | 86.61% |
| Detailed statistics, 24-week range | 4,564 ms | 1,181 ms | 74.13% |
| All-time statistics | 1,460 ms | 835 ms | 42.81% |
| Trend data, 24 weeks | 34,395 ms | 699 ms | 97.97% |

The unweighted mean of these five time reductions is **76.84%**. This is a workload comparison, not an average of every interaction in the app. Trend compares the original 24 concurrent weekly requests with one batch request. IPC serialization and browser rendering are measured separately below.

Raw repeated samples: [backend-snapshot.json](backend-snapshot.json).

The optimized native dev application successfully built and launched alongside the installed app. Visible end-to-end screen timing remains unverified: the native window repeatedly became minimized before the scenario's paint observation, and the scenario correctly rejected those samples. The table reports actual backend executions, not inferred browser paint times or a production deployment.

## Changes that produced the gains

- Calendar and weekly statistics read indexed date ranges instead of repeatedly loading the entire history. Broad ranges use a sequential scan when the index would produce excessive random reads and sorting.
- A covering active-log index accelerates compact all-history bounds and app totals without fetching full log rows.
- Trend computes all requested weeks in one pass and one IPC request, avoiding 24 competing full-history reads and redundant sidebar calculations.
- Statistics reuse title classifications and compiled category rules. Local calendar conversions use an hour cache with exact fallbacks around timezone transitions.
- Chart transformations are memoized. Gap connectors are grouped into a handful of SVG paths, avoiding a separate chart component for every gap.
- Paint telemetry excludes suspended/hidden windows, so time spent away from the app cannot masquerade as rendering time.

A combined regex matcher was tested and discarded because it was slower on this history. SQL hour aggregation was also discarded after the cached per-row clock performed better.

## Frontend computation and sync database lookup

The reproducible synthetic 24-week frontend fixture shows **84.50%** less category-series computation and **87.76%** less top-app-series computation, averaging **86.13%**. These are model computation timings, not complete screen load times. Details and raw samples: [frontend-series.md](frontend-series.md) and [frontend-series.json](frontend-series.json).

A separate temporary-copy SQL benchmark measures the deleted-log lookup used by sync: **73.32 ms to 0.14 ms**, a **99.80%** reduction across ten repetitions. The new partial index preserves full returned rows and also accelerates cleanup. This does not measure network sync and cannot establish improvement to the production HTTP outliers. See `scripts/performance/sync-database.benchmark.cjs` and [sync-database.json](sync-database.json).

## Validation and isolation

- The repeated legacy/optimized benchmark run passed all 31 Rust tests, including both opt-in performance/parity scenarios.
- The final normal Rust suite passed 30 tests, with the two performance scenarios intentionally skipped; it includes the additional deleted-log index test.
- Frontend tests: 35 passed, one opt-in benchmark skipped. The separate synthetic benchmark was executed explicitly.
- The production frontend build passed. The optimized native dev build uses `debug-assertions = true`, keeping development safety guards enabled.
- Dev uses `%APPDATA%/time-tracker-dev/apptest.db`, separate WebView storage and backups, and disables activity tracking, sync, updater operations, startup registration cleanup, and Google Calendar network access.

## Reproducing

Start the isolated dev application:

```powershell
npm.cmd start -- --no-watch -- --profile performance
```

Run normal Rust checks, or explicitly include the performance scenarios:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --profile performance --lib -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --profile performance --lib -- --include-ignored --nocapture --test-threads=1
node scripts/performance/sync-database.benchmark.cjs
```

The native UI scenario is opt-in via `VITE_PERF_SCENARIO=1` in `.env.local`; it refuses to run against a database outside `time-tracker-dev/apptest.db`, clears relevant query caches for each repetition, and requires visible paints. Remove the flag after capture. Logs and exported JSON contain timings and counts; application titles and credentials are not included in the published reports.
