# Time Tracker

Private, automatic desktop time tracking for Windows, macOS, and Linux. 100% local. No cloud. No telemetry.

## Why

Manual time tracking is tedious and inconsistent. Time Tracker runs in the background and logs your active window usage automatically so you can see where your time goes.

## Features

- **Automatic tracking**: Monitors foreground window every second and logs active application usage
- **Cross-platform support**: Works on Windows, macOS, and Linux (X11 only for Linux)
- **System tray integration**: Runs in the background with system tray icon; window can be hidden to tray
- **Local storage**: SQLite database stored locally (platform-specific paths)
- **Skipped apps with regex**: Use regex patterns to skip tracking specific apps (e.g., `^Chrome$` for exact match or `.*Discord.*` for partial match)
- **Categorization system**: Categories and regex-based rules for organizing tracked time
- **API endpoints**: Query logs, categories, and category regex rules via Tauri commands
- **Background process**: Continuous monitoring that aggregates duration for the same application

## Privacy

- All data is stored locally on your machine:
  - **Windows**: `%APPDATA%/time-tracker/app.db`
  - **macOS**: `~/Library/Application Support/time-tracker/app.db`
  - **Linux**: `~/.local/share/time-tracker/app.db`
- No cloud, no telemetry, no third‑party services
- Offline by design. The app does not make network requests

## Tech Stack

- **Tauri 2**: Rust backend with system WebView
- **Frontend**: React + Vite + TypeScript
- **Database**: SQLite via `sqlx` (bundled, runtime-tokio-rustls)
- **Platform-specific APIs**:
  - **Windows**: `windows` crate for foreground window detection
  - **macOS**: `objc` crate for NSWorkspace API
  - **Linux**: `x11` crate for X11 window management (X11 only, Wayland not supported)
- **Time handling**: `chrono` for timestamp formatting
- **Async runtime**: Tokio for background process
- **Regex**: Pattern matching for skipped apps and category rules

## Setup

### Prerequisites

- Node.js and npm
- Rust and Cargo
- Platform-specific requirements:
  - **Windows**: No additional requirements
  - **macOS**: Xcode Command Line Tools (for building)
  - **Linux**: X11 development libraries (for X11 support)
    - Ubuntu/Debian: `sudo apt-get install libx11-dev`
    - Fedora: `sudo dnf install libX11-devel`
    - Arch: `sudo pacman -S libx11`

### Development

```bash
git clone https://github.com/Tariq-Sekhri/time_tracker
cd time_tracker
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Builds use SQLx **offline mode** (the `.sqlx/` cache in `src-tauri/`). No database is required at compile time. If you change Rust SQL queries, regenerate the cache:

```bash
cd src-tauri
# Use the real app DB (ensure the app has been run at least once)
$env:DATABASE_URL = "sqlite:C:/Users/<you>/AppData/Roaming/time-tracker/app.db"   # Windows PowerShell
# DATABASE_URL="sqlite:$HOME/Library/Application Support/time-tracker/app.db"      # macOS
# DATABASE_URL="sqlite:$HOME/.local/share/time-tracker/app.db"                     # Linux
cargo sqlx prepare
```

Commit updated `.sqlx/` after running `sqlx prepare`. For CI or builds without a DB, set `SQLX_OFFLINE=true` when running `cargo build` (Tauri build does not need it if `DATABASE_URL` is unset).

## Platform-Specific Notes

### Windows
- Fully supported with native Windows API
- No additional configuration required

### macOS
- Requires accessibility permissions in System Settings → Privacy & Security → Accessibility
- The app will prompt you to grant permissions on first run

### Linux
- **X11 only**: Currently only supports X11, not Wayland
- If you're on Wayland, you'll need to switch to X11 or wait for Wayland support
- Many modern distributions (GNOME, KDE Plasma 6+) use Wayland by default
- To check your display server: `echo $XDG_SESSION_TYPE`

## Current Status

The app is functional with automatic tracking, database storage, and UI for managing categories, regex rules, and skipped apps. Cross-platform support is implemented with platform-specific foreground app detection.

## Contributing

All help is welcome—issues, PRs, questions. No strict rules yet; guidelines will be added as needed. If you're unsure, open an issue first.

## License

Polyform Noncommercial 1.0. For commercial use, open an issue.
