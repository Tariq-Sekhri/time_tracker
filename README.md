# Time Tracker

Private, automatic desktop time tracking for Windows and Linux. 100% local. No cloud. No telemetry.

Linux is supported and tested on **Ubuntu 24.04.4 Desktop amd64** ([`ubuntu-24.04.4-desktop-amd64.iso`](https://releases.ubuntu.com/24.04.4/)).

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
npm run tauri dev
```

### Build

```bash
npx tauri build
```

Builds use SQLx **offline mode** (the `.sqlx/` cache in `src-tauri/`). No database is required at compile time. If you change Rust SQL queries, regenerate the cache:

```bash
cd src-tauri
# Use the real app DB (ensure the app has been run at least once)
$env:DATABASE_URL = "sqlite:C:/Users/<you>/AppData/Roaming/time-tracker/app.db"
cargo sqlx prepare
```

On Linux (after the app has created the DB at least once):

```bash
export DATABASE_URL="sqlite:/home/<you>/.local/share/time-tracker/app.db"
cargo sqlx prepare
```

Commit updated `.sqlx/` after running `sqlx prepare`. For CI or builds without a DB, set `SQLX_OFFLINE=true` when running `cargo build` (Tauri build does not need it if `DATABASE_URL` is unset).

## Platform Notes

### Windows
- Fully supported with native Windows API
- No additional configuration required

### Linux (Ubuntu 24.04.4 Desktop amd64)
- Supported and tested with `ubuntu-24.04.4-desktop-amd64.iso`
- Default Ubuntu Desktop (GNOME) uses session DBus and AT-SPI; other desktops may rely on optional tools (xdotool, hyprctl, swaymsg, etc.)

## Contributing

All help is welcome—issues, PRs, questions. No strict rules yet; guidelines will be added as needed. If you're unsure, open an issue first.

## License

Polyform Noncommercial 1.0. For commercial use, open an issue.
