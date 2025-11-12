# Time Tracker

Private, automatic desktop time tracking for Windows. 100% local. No cloud. No telemetry.

## Why

Manual time tracking is tedious and inconsistent. Time Tracker runs in the background and logs your active window usage automatically so you can see where your time goes.

## Features

- **Automatic tracking**: Monitors foreground window every second and logs active application usage
- **System tray integration**: Runs in the background with system tray icon; window can be hidden to tray
- **Local storage**: SQLite database stored in `%APPDATA%/time-tracker/app.db`
- **Categorization system**: Categories and regex-based rules for organizing tracked time (schema ready, UI pending)
- **API endpoints**: Query logs, categories, and category regex rules via Tauri commands
- **Background process**: Continuous monitoring that aggregates duration for the same application

## Privacy

- All data is stored locally on your machine in `%APPDATA%/time-tracker/app.db`
- No cloud, no telemetry, no third‑party services
- Offline by design. The app does not make network requests

## Data Model

### Tables

**logs**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `app` TEXT NOT NULL (foreground window title)
- `timestamp` INTEGER NOT NULL (Unix time, seconds)
- `duration` INTEGER NOT NULL DEFAULT 0 (seconds)

**category**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL UNIQUE

**category_regex**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `cat_id` INTEGER NOT NULL (references category.id)
- `regex` TEXT NOT NULL
- `priority` INTEGER

## Tech Stack

- **Tauri 2**: Rust backend with system WebView
- **Frontend**: React + Vite + TypeScript
- **Database**: SQLite via `sqlx` (bundled, runtime-tokio-rustls)
- **Windows API**: `windows` crate for foreground window detection
- **Time handling**: `chrono` for timestamp formatting
- **Async runtime**: Tokio for background process

## Setup

### Prerequisites

- Node.js and npm
- Rust and Cargo
- Windows (for building/running)

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

## Current Status

The app is functional with automatic tracking, database storage, and basic UI. The categorization system has database support but the UI for managing categories and regex rules is still in development.

## Contributing

All help is welcome—issues, PRs, questions. No strict rules yet; guidelines will be added as needed. If you're unsure, open an issue first.

## License

Polyform Noncommercial 1.0. See LICENSE. For commercial use, open an issue.
