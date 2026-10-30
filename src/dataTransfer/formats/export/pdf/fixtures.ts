import type {ExportActivitySession, ExportDataset, ExportManualCategory, ExportManualEntry} from "../../../../api/dataTransfer.ts";
import type {ExportOptions} from "../../../types.ts";

/* Test / sample fixtures for the PDF report. Not imported by app code. */

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function samplePdfOptions(overrides: Partial<ExportOptions["pdf"]> = {}, rest: Partial<ExportOptions> = {}): ExportOptions {
    return {
        format: "pdf",
        framework: "native",
        columns: {},
        durationFormat: "hm",
        timeFormat: "24h",
        dateFormat: "iso",
        csvDelimiter: ",",
        csvBom: false,
        rounding: 0,
        roundingMode: "nearest",
        summaryGrouping: "day",
        userName: "",
        userEmail: "",
        ...rest,
        pdf: {
            title: "Monthly time report",
            preparedBy: "Northwind Studio",
            preparedFor: "Acme Corp",
            orientation: "portrait",
            pageSize: "a4",
            accentColor: "#2563eb",
            sections: {overview: true, categoryBreakdown: true, dailyBreakdown: true, deviceBreakdown: true, detail: true, signature: true},
            ...overrides,
        },
    };
}

export function emptyDataset(rangeStart = localTs(2026, 9, 28), rangeEnd = localTs(2026, 10, 26)): ExportDataset {
    return {
        generated_at: localTs(2026, 10, 23, 9, 30),
        app_version: "1.12.7",
        range_start: rangeStart,
        range_end: rangeEnd,
        manual_entries: [],
        activity_sessions: [],
        activity_logs: [],
        devices: [],
        activity_categories: [],
        manual_categories: [],
        app_groups: [],
        skipped_apps: [],
    };
}

export function localTs(year: number, month: number, day: number, hour = 0, minute = 0): number {
    return Math.floor(new Date(year, month - 1, day, hour, minute).getTime() / 1000);
}

const MANUAL_CATEGORIES: ExportManualCategory[] = [
    {id: 1, name: "Acme Corp", color: "#2563eb", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 2, name: "Website redesign", color: "#3b82f6", parent_id: 1, parent_name: "Acme Corp", priority: 0, rules: []},
    {id: 3, name: "Mobile app", color: "#60a5fa", parent_id: 1, parent_name: "Acme Corp", priority: 0, rules: []},
    {id: 4, name: "Globex", color: "#f97316", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 5, name: "Data migration", color: "#fb923c", parent_id: 4, parent_name: "Globex", priority: 0, rules: []},
    {id: 6, name: "Initech", color: "#14b8a6", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 7, name: "Internal", color: "#8b5cf6", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 8, name: "Meetings", color: "#a78bfa", parent_id: 7, parent_name: "Internal", priority: 0, rules: []},
    {id: 9, name: "Admin & invoicing", color: "#c4b5fd", parent_id: 7, parent_name: "Internal", priority: 0, rules: []},
    {id: 10, name: "Learning", color: "#eab308", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 11, name: "Umbrella Health", color: "#ec4899", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 12, name: "Stark Industries", color: "#ef4444", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 13, name: "Wayne Enterprises", color: "#64748b", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 14, name: "Hooli", color: "#22c55e", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: 15, name: "Pied Piper", color: "#10b981", parent_id: null, parent_name: null, priority: 0, rules: []},
    {id: null, name: "Uncategorized", color: "#9ca3af", parent_id: null, parent_name: null, priority: 0, rules: []},
];

const TITLES: Record<number | string, string[]> = {
    2: ["Homepage hero iterations", "Pricing page layout and responsive breakpoints for tablet and small laptop screens", "Design review with stakeholders", "Component library cleanup"],
    3: ["Onboarding flow prototype", "Push notification settings screen", "Fix crash on Android 14 when resuming from background"],
    4: ["Kick-off call", "Estimate for Q4 roadmap"],
    5: ["Map legacy customer tables to the new schema", "Migration dry run", "Write rollback plan"],
    6: ["TPS report automation", "Bug triage"],
    8: ["Weekly planning", "1:1 with Sam", "Team retro"],
    9: ["Invoicing", "Expense reports", "Café receipts & mileage log – Q3"],
    10: ["Rust ownership deep dive", "Reading: Designing Data-Intensive Applications"],
    11: ["Patient portal accessibility audit"],
    12: ["Suit telemetry dashboard"],
    13: ["Security review"],
    14: ["Compression benchmark"],
    15: ["Middle-out prototype"],
    uncategorized: ["Misc", "東京 client call 🚀 follow-up"],
};

const NOTES = [
    "Discussed scope changes; client approved the revised timeline.",
    "Blocked for 20 minutes waiting on staging credentials. Followed up with ops.",
    "Pairing session — covered edge cases around time zones, daylight saving transitions, and the overnight entries that span midnight.",
    "",
    "",
    "",
];

type Weighted = {id: number | null; weight: number};
const CATEGORY_WEIGHTS: Weighted[] = [
    {id: 2, weight: 26},
    {id: 3, weight: 16},
    {id: 4, weight: 3},
    {id: 5, weight: 14},
    {id: 6, weight: 8},
    {id: 8, weight: 9},
    {id: 9, weight: 4},
    {id: 10, weight: 5},
    {id: 11, weight: 3},
    {id: 12, weight: 2},
    {id: 13, weight: 2},
    {id: 14, weight: 1.5},
    {id: 15, weight: 1},
    {id: null, weight: 2},
];

const ACTIVITY_CATEGORIES = [
    {name: "Coding", color: "#16a34a"},
    {name: "Browsing", color: "#0ea5e9"},
    {name: "Communication", color: "#f59e0b"},
    {name: "Design", color: "#d946ef"},
    {name: "Documents", color: null},
    {name: "Entertainment", color: "#ef4444"},
];
const APPS: Record<string, string[]> = {
    Coding: ["Visual Studio Code", "Windows Terminal", "RustRover", "GitHub Desktop"],
    Browsing: ["Vivaldi", "Firefox", "Stack Overflow"],
    Communication: ["Slack", "Microsoft Teams", "Outlook", "Zoom"],
    Design: ["Figma", "Photoshop"],
    Documents: ["Word", "Excel", "Notion"],
    Entertainment: ["Spotify", "YouTube"],
};

function pick<T>(random: () => number, items: T[]): T {
    return items[Math.floor(random() * items.length)];
}

function pickWeighted(random: () => number, items: Weighted[]): Weighted {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = random() * total;
    for (const item of items) {
        roll -= item.weight;
        if (roll <= 0) return item;
    }
    return items[items.length - 1];
}

/** ~4 weeks, ~150 manual entries, ~400 activity sessions over 2 devices. */
export function sampleDataset(options: {days?: number; seed?: number; manual?: boolean; sessions?: boolean} = {}): ExportDataset {
    const random = rng(options.seed ?? 42);
    const days = options.days ?? 28;
    const start = localTs(2026, 9, 28);
    const dataset = emptyDataset(start, localTs(2026, 9, 28 + days));
    dataset.manual_categories = MANUAL_CATEGORIES;
    dataset.activity_categories = ACTIVITY_CATEGORIES.map((c, i) => ({name: c.name, color: c.color, priority: i, is_visible: true, in_stats: true, rules: []}));
    dataset.devices = [
        {uuid: "dev-1", name: "Studio Desktop", kind: "local", in_cal: true, in_stats: true},
        {uuid: "dev-2", name: "MacBook Pro (travel)", kind: "remote", in_cal: true, in_stats: true},
    ];

    let id = 1;
    const manual: ExportManualEntry[] = [];
    const sessions: ExportActivitySession[] = [];
    for (let day = 0; day < days; day++) {
        const date = new Date(2026, 8, 28 + day);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        if (weekend && random() < 0.7) continue;
        // Manual entries: stacked through the day.
        let cursor = localTs(date.getFullYear(), date.getMonth() + 1, date.getDate(), 8, Math.floor(random() * 4) * 15);
        const count = weekend ? 1 + Math.floor(random() * 2) : 4 + Math.floor(random() * 5);
        for (let i = 0; i < count; i++) {
            const weighted = pickWeighted(random, CATEGORY_WEIGHTS);
            const category = MANUAL_CATEGORIES.find(c => c.id === weighted.id)!;
            const duration = (15 + Math.floor(random() * 10) * 13) * 60 + Math.floor(random() * 60);
            const title = pick(random, TITLES[weighted.id ?? "uncategorized"]);
            manual.push({
                id: id++,
                title,
                notes: pick(random, NOTES) || null,
                category_id: category.id,
                category: category.name,
                parent_category: category.parent_name,
                category_color: category.color,
                start_time: cursor,
                end_time: cursor + duration,
                duration,
                created_at: cursor,
                updated_at: cursor,
            });
            cursor += duration + Math.floor(random() * 4) * 300;
        }
        // Activity sessions per device.
        for (const device of dataset.devices) {
            if (device.uuid === "dev-2" && random() < 0.4) continue;
            let at = localTs(date.getFullYear(), date.getMonth() + 1, date.getDate(), device.uuid === "dev-1" ? 8 : 13, Math.floor(random() * 60));
            const n = weekend ? 2 + Math.floor(random() * 3) : device.uuid === "dev-1" ? 9 + Math.floor(random() * 4) : 4 + Math.floor(random() * 4);
            for (let i = 0; i < n; i++) {
                const category = pick(random, ACTIVITY_CATEGORIES);
                const duration = (10 + Math.floor(random() * 50)) * 60;
                const apps = [...APPS[category.name]]
                    .sort(() => random() - 0.5)
                    .slice(0, 1 + Math.floor(random() * 3))
                    .map((app, index) => ({app, duration: Math.floor(duration * (index === 0 ? 0.6 : 0.15))}))
                    .sort((a, b) => b.duration - a.duration);
                sessions.push({
                    device_uuid: device.uuid,
                    device_name: device.name,
                    category: category.name,
                    category_color: category.color,
                    start_time: at,
                    end_time: at + duration,
                    duration,
                    active_duration: apps.reduce((sum, app) => sum + app.duration, 0),
                    apps,
                });
                at += duration + Math.floor(random() * 3) * 300;
            }
        }
    }
    if (options.manual !== false) dataset.manual_entries = manual;
    if (options.sessions !== false) dataset.activity_sessions = sessions;
    return dataset;
}

/** Adds raw activity logs (and removes sessions) to test the log fallback. */
export function withLogs(dataset: ExportDataset, count: number): ExportDataset {
    const random = rng(7);
    const logs = Array.from({length: count}, (_, i) => {
        const category = pick(random, ACTIVITY_CATEGORIES);
        return {
            device_uuid: "dev-1",
            device_name: "Studio Desktop",
            id: i + 1,
            app: pick(random, APPS[category.name]),
            app_group: null,
            category: category.name,
            timestamp: dataset.range_start + Math.floor((i / count) * (dataset.range_end - dataset.range_start)),
            duration: 5 + Math.floor(random() * 55),
        };
    });
    return {...dataset, activity_sessions: [], activity_logs: logs};
}
