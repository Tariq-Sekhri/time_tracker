export type Rand = (min: number, max: number) => number;

const pick = <T>(r: Rand, xs: readonly T[]): T => xs[r(0, xs.length - 1)];

const CODE_FILES = [
    "src/db/pool.rs",
    "week.rs",
    "demo/mock/core.ts",
    "Statistics.tsx",
    "invoke.ts",
    "Cargo.toml",
    "log.ts",
    "calendarViewPrefs.ts",
    "app.db",
    "migrations/20240101_logs.sql",
    ".github/workflows/ci.yml",
    "tailwind.config.js",
    "src-tauri/src/core.rs",
] as const;

const CODE_WORKSPACES = ["sidecar", "portfolio", "advent-2024", "notes"] as const;

const BROWSERS = ["Vivaldi", "Google Chrome", "Microsoft Edge", "Firefox"] as const;

const YT_STEMS = [
    "Rust error handling: thiserror vs anyhow",
    "The Primeagen: Vim motions that stuck",
    "System design: rate limiting in 15 minutes",
    "Rocket League mechanics guide (air roll)",
    "Building a Tauri app from scratch",
    "PostgreSQL indexes explained",
    "Git rebase vs merge — practical take",
    "Linux filesystem in 10 minutes",
    "TypeScript satisfies operator",
    "Obsidian for developers",
] as const;

const WEB_PAGES = [
    "sqlx compile-time queries - Search",
    "docs.rs/sqlx/latest/sqlx - Vivaldi",
    "Issues · tariqsekhri/time_tracker - Vivaldi",
    "Pull requests · time-tracker - GitHub - Vivaldi",
    "SQLite: pragma foreign_keys - Vivaldi",
    "React Query useQuery staleTime - Vivaldi",
] as const;

const DISCORD_SERVERS = [
    "The Coding Den",
    "Rust Community",
    "Tauri",
    "Local Meetup Devs",
    "Game Night EU",
] as const;

const DISCORD_CHANNELS = [
    "#general",
    "#help",
    "#showcase",
    "#rust",
    "#frontend",
    "#random",
    "#lfg",
] as const;

const SLACK_WORKSPACES = ["Acme Eng", "Consulting Co", "Startup-42"] as const;

const SLACK_CHANS = ["engineering", "standups", "watercooler", "releases"] as const;

const TEAMS_TITLES = [
    "Weekly sync | Microsoft Teams",
    "Design review — Microsoft Teams",
    "1:1 — Microsoft Teams",
] as const;

const ZOOM_TITLES = [
    "Zoom Meeting - standup",
    "Zoom - Interview (Guest)",
    "project-kickoff - Zoom",
] as const;

const UDEMY = [
    "Rust Web Development | Udemy",
    "Advanced TypeScript Patterns | Udemy",
    "Docker for Developers | Udemy",
] as const;

const COURSERA = [
    "Algorithms, Part I | Coursera - Vivaldi",
    "Machine Learning | Coursera - Chrome",
] as const;

const NOTION_PAGES = [
    "Sprint notes – Feb / roadmap",
    "Meeting notes: API redesign",
    "Personal / reading list",
] as const;

const NETFLIX_SHOWS = ["Stranger Things", "The Bear", "Slow Horses", "Arcane", "Dark"] as const;

const SPOTIFY = [
    "Daily Mix 3 | Spotify",
    "Discover Weekly | Spotify",
    "Lo-Fi Beats | Spotify",
] as const;

const YT_MUSIC = [
    "Chillhop Radio | YouTube Music | YouTube Music Desktop App",
    "Synthwave playlist | YouTube Music | YouTube Music Desktop App",
] as const;

const VLC_NAMES = [
    "2026-01-15 14-22-10.mkv - VLC media player",
    "screen-recording-demo.mkv - VLC media player",
    "clip-from-stream.mp4 - VLC media player",
] as const;

const KINDLE = [
    "The Pragmatic Programmer - Kindle",
    "Designing Data-Intensive Applications - Kindle",
] as const;

export function realisticCodingWindow(r: Rand, ideToken: string): string {
    const f = pick(r, CODE_FILES);
    const w = pick(r, CODE_WORKSPACES);
    if (ideToken === "Cursor") return `${f} - ${w} - Cursor`;
    if (ideToken === "Visual Studio Code") return `${f} - ${w} - Visual Studio Code`;
    if (ideToken === "cmd.exe") return `C:\\WINDOWS\\system32\\cmd.exe`;
    if (ideToken === "Windows PowerShell") return "Windows PowerShell";
    if (ideToken === "Administrator: Windows PowerShell")
        return "Administrator: Windows PowerShell";
    if (ideToken === "Terminal") return `PowerShell 7.4 (${w}) - Terminal`;
    if (ideToken === "GitHub Desktop") return `${w} – GitHub Desktop`;
    if (ideToken === "Neovim") return `NVIM v0.10: ${f}`;
    if (ideToken === "Postman") return `GET /api/v1/health – ${w} – Postman`;
    if (ideToken === "DBeaver") return `DBeaver 24.2 - <localhost>/${w}`;
    if (ideToken === "Android Studio") return `MainActivity.kt (${w}) – Android Studio`;
    if (ideToken === "Xcode") return `ContentView.swift — ${w} — Xcode`;
    if (ideToken === "IntelliJ") return `${f} – ${w} – IntelliJ IDEA`;
    if (
        ideToken.endsWith("Storm") ||
        ideToken === "Rider" ||
        ideToken === "CLion" ||
        ideToken === "GoLand"
    )
        return `${f} – ${w} – ${ideToken}`;
    if (ideToken === "Sublime Text") return `${f} • ${w} • Sublime Text`;
    return `${f} - ${w} - ${ideToken}`;
}

export function realisticGameWindow(r: Rand, token: string): string {
    if (token === "Steam") return pick(r, ["Steam", "Friends - Steam", "Library - Steam"] as const);
    if (token === "Epic Games") return "Epic Games Launcher";
    if (token === "Battle.net") return "Battle.net";
    if (token === "Riot Client") return "Riot Client";
    if (token === "GOG Galaxy") return "GOG GALAXY";
    if (token === "EA app") return "EA app";
    if (token === "Ubisoft Connect") return "Ubisoft Connect";
    if (token === "Team Fortress 2 - Direct3D 9 - 64 Bit") return token;
    if (token.startsWith("^Rocket")) return "Rocket League (64-bit, DX11, Cooked)";
    const suffix = r(0, 7) === 0 ? " — matchmaking" : "";
    return `${token}${suffix}`;
}

export function realisticYoutubeTab(r: Rand): string {
    return `${pick(r, YT_STEMS)} - YouTube - ${pick(r, BROWSERS)}`;
}

export function realisticBrowserNonVideo(r: Rand): string {
    return `${pick(r, WEB_PAGES)}`;
}

export function realisticDiscordLine(r: Rand): string {
    return `${pick(r, DISCORD_CHANNELS)} | ${pick(r, DISCORD_SERVERS)} - Discord`;
}

export function realisticSlackLine(r: Rand): string {
    return `${pick(r, SLACK_CHANS)} - ${pick(r, SLACK_WORKSPACES)} - Slack`;
}

export function realisticMeetTitle(r: Rand): string {
    return pick(r, TEAMS_TITLES);
}

export function realisticZoomTitle(r: Rand): string {
    return pick(r, ZOOM_TITLES);
}

export function realisticLearningTitle(r: Rand): string {
    const k = r(0, 3);
    if (k === 0) return pick(r, UDEMY);
    if (k === 1) return pick(r, COURSERA);
    if (k === 2) return `${pick(r, NOTION_PAGES)} - Notion`;
    return `Exercise: recursion – Khan Academy - ${pick(r, BROWSERS)}`;
}

export function realisticReadingTitle(r: Rand): string {
    if (r(0, 1) === 0) return pick(r, KINDLE);
    return `${pick(r, NOTION_PAGES)} - Notion`;
}

export function realisticMusicTitle(r: Rand): string {
    return r(0, 1) === 0 ? pick(r, SPOTIFY) : pick(r, YT_MUSIC);
}

export function realisticVlcTitle(r: Rand): string {
    return pick(r, VLC_NAMES);
}

export function realisticWatchingPair(r: Rand): [string, string] {
    return [
        realisticYoutubeTab(r),
        `${pick(r, NETFLIX_SHOWS)} | Netflix - ${pick(r, BROWSERS)}`,
    ];
}
