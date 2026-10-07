# Time Tracker

Private, automatic desktop time tracking for Windows and Linux. 100% local. No cloud. No telemetry.

Linux is supported and tested on **Ubuntu 24.04.4 Desktop amd64** ([`ubuntu-24.04.4-desktop-amd64.iso`](https://releases.ubuntu.com/24.04.4/)).

## Product demo video:
[YouTube](https://www.youtube.com/watch?v=4JMSmt3tppc)

## Demo

The web demo includes a simulated sync server at `demo-sync.invalid`, a local desktop, subscribed laptop and phone, and a tablet you can subscribe to. Subscriptions, downloaded activity, device filters, and Sync Now work in memory until the page reloads. Server edits are rejected; use Cancel to return. Sync never contacts a server. The demo build blocks external requests with a browser content security policy and guards for fetch, XHR, beacons, sockets, and event streams.

[https://tariq-sekhri.github.io/time_tracker/](https://tariq-sekhri.github.io/time_tracker/)

## Why

Manual time tracking is tedious and inconsistent. Time Tracker runs in the background and logs your active window usage automatically so you can see where your time goes.

## Features

- **Automatic tracking**: Monitors foreground window every second and logs active application usage
- **Windows and Linux support**: Built and supported for Windows; Linux supported on Ubuntu 24.04.4 Desktop amd64 (`ubuntu-24.04.4-desktop-amd64.iso`)
- **System tray integration**: Runs in the background with system tray icon; window can be hidden to tray
- **Local storage**: SQLite database stored locally (see Privacy)
- **Skipped apps with regex**: Use regex patterns to skip tracking specific apps (e.g., `^Chrome$` for exact match or `.*Discord.*` for partial match)
- **Categorization system**: Categories and regex-based rules for organizing tracked time
- **API endpoints**: Query logs, categories, and category regex rules via Tauri commands
- **Background process**: Continuous monitoring that aggregates duration for the same application

## Privacy

- All data is stored locally on your machine:
  - **Windows**: `%APPDATA%/time-tracker/app.db`
  - **Linux**: `~/.local/share/time-tracker/app.db` (XDG data directory)
- No cloud, no telemetry, no third‑party services
- Offline by design. The app does not make network requests

## Support logs

Open **Settings → Support logs → Open log folder**. If the app crashes, send the log file from the launch that crashed; restarting creates a newer file, so the crashed launch may be the second-newest file.

- Windows: `%APPDATA%\time-tracker\logs`
- Linux: `~/.local/share/time-tracker/logs` (or your XDG data directory)
- Files are named `time-tracker-YYYY-MM-DD_HH-MM-SS.mmm-PID.log`. The ten most recent launches are retained.
- Each launch has **one shared chronological file** for frontend and Rust backend entries at every level. There are no separate error, critical, debug, or tracking diagnostic files.
- Records include app version, OS, launch/setup/exit, screen navigation, command starts/results/timings, settings changes, tracking status, database setup/backups, sync, Google Calendar failures, updates, JavaScript errors, rejected promises, React errors, and Rust panics with stacks/backtraces. Errors are written even when recovered or intentionally ignored; native errors are synced to disk before returning.
- These logs are separate from your tracked time records. They stay on your machine. Credentials and URL query strings are redacted; note bodies and calendar content are not copied into operation logs. Logs may still contain paths and error details, so review them before sharing.
- An abrupt OS/process termination or native WebView crash may leave only the operations immediately preceding it, rather than an exception entry. The log still provides the app version and what it was doing.

## Tech Stack

- **Tauri 2**: Rust backend with system WebView
- **Frontend**: React + Vite + TypeScript
- **Database**: SQLite via `sqlx` (bundled, runtime-tokio-rustls)
- **Platform APIs**:
  - **Windows**: `windows` crate for foreground window detection
  - **Linux**: Foreground window title via GNOME session DBus, AT-SPI, and fallbacks (xdotool, compositor tools, etc.); tested on Ubuntu 24.04.4 Desktop amd64
- **Time handling**: `chrono` for timestamp formatting
- **Async runtime**: Tokio for background process
- **Regex**: Pattern matching for skipped apps and category rules

## Setup

### Prerequisites

- Node.js and npm
- Rust and Cargo
- Platform requirements:
  - **Windows**: No additional requirements
  - **Linux**: Ubuntu 24.04.4 Desktop amd64 (`ubuntu-24.04.4-desktop-amd64.iso`)

### Development

```bash
git clone https://github.com/Tariq-Sekhri/time_tracker
cd time_tracker
npm install
npm start
```

Development uses `time-tracker-dev/apptest.db` in the user's application data directory,
with separate WebView storage and backups. Startup takes a consistent, read-only snapshot
of the installed app's `time-tracker/app.db`. Tracking, sync, updater installation, and
Google Calendar network access are disabled in development.

For optimized native measurements while retaining all development isolation guards:

```powershell
npm.cmd start -- --no-watch -- --profile performance
```

### Build

```bash
npx tauri build
```

Builds use SQLx **offline mode** (the `.sqlx/` cache in `src-tauri/`). No database is required at compile time. If you change Rust SQL queries, regenerate the cache from the debug database:

```bash
cd src-tauri
# Ensure the app has created apptest.db at least once.
$env:DATABASE_URL = "sqlite:///C:/Users/<you>/AppData/Roaming/time-tracker-dev/apptest.db"
cargo sqlx prepare
```

On Linux:

```bash
export DATABASE_URL="sqlite:///home/<you>/.local/share/time-tracker-dev/apptest.db"
cargo sqlx prepare
```

Commit updated `.sqlx/` after running `sqlx prepare`. For CI or builds without a DB, set `SQLX_OFFLINE=true` when running `cargo build`.

## Platform Notes

### Windows
- Fully supported with native Windows API
- No additional configuration required

### Linux (Ubuntu 24.04.4 Desktop amd64)
- Supported and tested with `ubuntu-24.04.4-desktop-amd64.iso`
- Default Ubuntu Desktop (GNOME) uses session DBus and AT-SPI; other desktops may rely on optional tools (xdotool, hyprctl, swaymsg, etc.)

### macOS
- Not currently supported or released.

## Contributing

All help is welcome—issues, PRs, questions. No strict rules yet; guidelines will be added as needed. If you're unsure, open an issue first.

## License

Polyform Noncommercial 1.0. For commercial use, open an issue.
