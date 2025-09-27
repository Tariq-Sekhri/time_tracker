# Time Tracker (working name)

Private, automatic desktop time tracking for Windows. 100% local. No cloud. No telemetry.

Status: Pre‑alpha. Not usable yet.

## Why

Manual time tracking is tedious and inconsistent. Time Tracker runs in the background and logs your active window usage automatically so you can see where your time goes—without changing your habits.

## Features

- Automatic tracking of Foreground app 
- Local storage in SQLite
- Basic categorization via regex rules

## Privacy

- All data is stored locally on your machine.
- No cloud, no telemetry, no third‑party services.
- Offline by design. The app does not make network requests.

## Data model

Tables:

- logs
  - id INTEGER PRIMARY KEY
  - app TEXT (foreground window title)
  - ts INTEGER (Unix time, seconds)

- category
  - id INTEGER PRIMARY KEY
  - name TEXT

- category_regex
  - id INTEGER PRIMARY KEY
  - cat_id INTEGER REFERENCES category(id)
  - regex TEXT

## Tech stack

- Tauri 2 (Rust backend, system WebView)
- React + Vite + TypeScript
- SQLite via `rusqlite` (bundled)
- Windows API via `windows` crate
- Time handling via `chrono`

## Setup

```bash
git clone https://github.com/Tariq-Sekhri/time_tracker
cd time_tracker
npm install
npm run tauri dev
```

## Contributing

All help is welcome—issues, PRs, questions. No strict rules yet; guidelines will be added as needed. If you're unsure, open an issue first.

## License
Polyform Noncommercial 1.0. See LICENSE. For commercial use, open an issue.