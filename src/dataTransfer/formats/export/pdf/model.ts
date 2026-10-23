import type {ExportDataset, ExportSessionApp} from "../../../../api/dataTransfer.ts";
import type {ExportOptions, SummaryGrouping} from "../../../types.ts";
import {dayKey, roundDuration, weekKey} from "../../shared.ts";
import {OTHER_GRAY, parseHex, type Rgb, type Theme} from "./theme.ts";

/*
 * Pure aggregation for the PDF report. No jsPDF in here so it can be unit-tested directly.
 * Durations are rounded per row (options.rounding) and then summed, so every total in the
 * report equals the sum of the rows printed under it. Raw activity logs are never rounded:
 * they are seconds-long samples, and rounding each one would distort the totals.
 */

export type ManualRow = {
    start: number;
    end: number;
    /** Rounded duration, seconds. */
    seconds: number;
    title: string;
    notes: string;
    /** Leaf category name. */
    category: string;
    parent: string | null;
    /** Category the charts roll up to (the parent for subcategories). */
    rollup: string;
    color: Rgb | null;
    rollupColor: Rgb | null;
};

export type ActivityRow = {
    kind: "session" | "log";
    start: number;
    end: number;
    seconds: number;
    device: string;
    category: string;
    color: Rgb | null;
    /** Sessions: apps sorted by time. Logs: the single app. */
    apps: ExportSessionApp[];
};

export type CategoryStat = {
    key: string;
    name: string;
    type: "manual" | "activity";
    entries: number;
    seconds: number;
    color: Rgb;
    /** Manual subcategories that have time, sorted by time. */
    children: CategoryStat[];
};

export type ChartBar = {label: string; seconds: number; color: Rgb; other: boolean};

export type BucketUnit = "day" | "week" | "month";
export type TimeBucket = {start: number; manual: number; activity: number; weekend: boolean};

export type DeviceStat = {name: string; items: number; seconds: number};

export type ReportTotals = {
    manual: number;
    activity: number;
    total: number;
    manualEntries: number;
    activityItems: number;
    activeDays: number;
    /** Calendar days in the reported range. */
    rangeDays: number;
    /** Total divided by active days. */
    dailyAverage: number;
};

export type ReportModel = {
    rangeStart: number;
    rangeEnd: number;
    hasManual: boolean;
    hasActivity: boolean;
    activitySource: "sessions" | "logs" | "none";
    manual: ManualRow[];
    activity: ActivityRow[];
    totals: ReportTotals;
    categories: CategoryStat[];
    chart: ChartBar[];
    bucketUnit: BucketUnit;
    buckets: TimeBucket[];
    devices: DeviceStat[];
};

export const MAX_CHART_BARS = 12;
const DAY = 86400;

export function buildReportModel(dataset: ExportDataset, options: ExportOptions, theme: Theme): ReportModel {
    const round = (seconds: number) => roundDuration(seconds, options.rounding, options.roundingMode);

    const manualColors = new Map<string, Rgb>();
    for (const category of dataset.manual_categories) {
        const color = parseHex(category.color);
        if (color && category.parent_id === null) manualColors.set(category.name, color);
    }
    const manual: ManualRow[] = dataset.manual_entries
        .map(entry => {
            const color = parseHex(entry.category_color);
            const rollup = entry.parent_category ?? entry.category;
            return {
                start: entry.start_time,
                end: entry.end_time,
                seconds: round(entry.duration),
                title: entry.title,
                notes: entry.notes?.trim() ?? "",
                category: entry.category,
                parent: entry.parent_category,
                rollup,
                color,
                rollupColor: entry.parent_category ? (manualColors.get(entry.parent_category) ?? color) : color,
            };
        })
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const activityColors = new Map<string, Rgb>();
    for (const category of dataset.activity_categories) {
        const color = parseHex(category.color);
        if (color) activityColors.set(category.name, color);
    }
    let activitySource: ReportModel["activitySource"] = "none";
    let activity: ActivityRow[] = [];
    if (dataset.activity_sessions.length) {
        activitySource = "sessions";
        activity = dataset.activity_sessions.map(session => ({
            kind: "session" as const,
            start: session.start_time,
            end: session.end_time,
            seconds: round(session.duration),
            device: session.device_name,
            category: session.category,
            color: parseHex(session.category_color) ?? activityColors.get(session.category) ?? null,
            apps: session.apps,
        }));
    } else if (dataset.activity_logs.length) {
        activitySource = "logs";
        activity = dataset.activity_logs.map(log => ({
            kind: "log" as const,
            start: log.timestamp,
            end: log.timestamp + log.duration,
            seconds: Math.max(0, log.duration),
            device: log.device_name,
            category: log.category,
            color: activityColors.get(log.category) ?? null,
            apps: [{app: log.app_group ?? log.app, duration: log.duration}],
        }));
    }
    activity.sort((a, b) => a.start - b.start || a.end - b.end);

    const [rangeStart, rangeEnd] = displayRange(dataset, manual, activity);
    const totals = computeTotals(manual, activity, rangeStart, rangeEnd);
    const categories = computeCategories(manual, activity, theme);
    const {unit, buckets} = computeBuckets(manual, activity, rangeStart, rangeEnd);

    return {
        rangeStart,
        rangeEnd,
        hasManual: manual.length > 0,
        hasActivity: activity.length > 0,
        activitySource,
        manual,
        activity,
        totals,
        categories,
        chart: chartBars(categories, MAX_CHART_BARS),
        bucketUnit: unit,
        buckets,
        devices: computeDevices(activity),
    };
}

/**
 * The dataset's own range, unless it is absurdly wide ("all time" exports): then the data's extent,
 * so charts are not thousands of empty days.
 */
function displayRange(dataset: ExportDataset, manual: ManualRow[], activity: ActivityRow[]): [number, number] {
    const start = dataset.range_start;
    const end = Math.max(dataset.range_end, start + 1);
    if (end - start <= 400 * DAY) return [start, end];
    if (!manual.length && !activity.length) return [start, end];
    // Activity archives can contain millions of samples. Spreading their timestamps into
    // Math.min/max exceeds the engine's argument limit, even though the PDF detail is capped.
    let earliest = Infinity;
    let latest = -Infinity;
    for (const rows of [manual, activity]) {
        for (const row of rows) {
            earliest = Math.min(earliest, row.start);
            latest = Math.max(latest, row.start);
        }
    }
    const first = startOfDay(earliest);
    const last = addDays(startOfDay(latest), 1);
    return [Math.max(start, first), Math.min(end, last)];
}

export function computeTotals(
    manual: Pick<ManualRow, "start" | "seconds">[],
    activity: Pick<ActivityRow, "start" | "seconds">[],
    rangeStart: number,
    rangeEnd: number,
): ReportTotals {
    const manualTotal = sum(manual.map(row => row.seconds));
    const activityTotal = sum(activity.map(row => row.seconds));
    const days = new Set<string>();
    for (const row of [...manual, ...activity]) if (row.seconds > 0) days.add(dayKey(row.start));
    const total = manualTotal + activityTotal;
    return {
        manual: manualTotal,
        activity: activityTotal,
        total,
        manualEntries: manual.length,
        activityItems: activity.length,
        activeDays: days.size,
        rangeDays: countDays(rangeStart, rangeEnd),
        dailyAverage: days.size ? total / days.size : 0,
    };
}

export function computeCategories(manual: ManualRow[], activity: ActivityRow[], theme: Theme): CategoryStat[] {
    const stats = new Map<string, CategoryStat & {pendingColor: Rgb | null}>();
    const get = (type: CategoryStat["type"], name: string, color: Rgb | null) => {
        const key = `${type}:${name}`;
        let stat = stats.get(key);
        if (!stat) {
            stat = {key, name, type, entries: 0, seconds: 0, color: OTHER_GRAY, children: [], pendingColor: color};
            stats.set(key, stat);
        }
        stat.pendingColor ??= color;
        return stat;
    };

    for (const row of manual) {
        const parent = get("manual", row.rollup, row.rollupColor);
        parent.entries += 1;
        parent.seconds += row.seconds;
        if (row.parent) {
            let child = parent.children.find(c => c.name === row.category);
            if (!child) {
                child = {key: `${parent.key}/${row.category}`, name: row.category, type: "manual", entries: 0, seconds: 0, color: row.color ?? OTHER_GRAY, children: []};
                parent.children.push(child);
            }
            child.entries += 1;
            child.seconds += row.seconds;
        }
    }
    for (const row of activity) {
        const stat = get("activity", row.category, row.color);
        stat.entries += 1;
        stat.seconds += row.seconds;
    }

    const sorted = [...stats.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
    // Fallback colors in a fixed order, skipping ones already used by explicit category colors.
    const used = sorted.map(stat => stat.pendingColor).filter((c): c is Rgb => !!c);
    const fallback = theme.palette.filter(color => !used.some(u => u.join() === color.join()));
    let next = 0;
    return sorted.map(({pendingColor, ...stat}) => {
        const color = pendingColor ?? (fallback.length ? fallback[next++ % fallback.length] : OTHER_GRAY);
        stat.children.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
        return {...stat, color};
    });
}

/** Top categories as bars, everything past `max - 1` folded into "Other". */
export function chartBars(categories: CategoryStat[], max: number): ChartBar[] {
    const withTime = categories.filter(c => c.seconds > 0);
    const labels = new Map<string, number>();
    for (const c of withTime) labels.set(c.name, (labels.get(c.name) ?? 0) + 1);
    const label = (c: CategoryStat) => ((labels.get(c.name) ?? 0) > 1 ? `${c.name} (${c.type})` : c.name);
    if (withTime.length <= max) return withTime.map(c => ({label: label(c), seconds: c.seconds, color: c.color, other: false}));
    const head = withTime.slice(0, max - 1);
    const rest = withTime.slice(max - 1);
    return [
        ...head.map(c => ({label: label(c), seconds: c.seconds, color: c.color, other: false})),
        {label: `Other (${rest.length})`, seconds: sum(rest.map(c => c.seconds)), color: OTHER_GRAY, other: true},
    ];
}

export function computeBuckets(
    manual: Pick<ManualRow, "start" | "seconds">[],
    activity: Pick<ActivityRow, "start" | "seconds">[],
    rangeStart: number,
    rangeEnd: number,
): {unit: BucketUnit; buckets: TimeBucket[]} {
    const days = countDays(rangeStart, rangeEnd);
    const unit: BucketUnit = days <= 62 ? "day" : days <= 7 * 106 ? "week" : "month";
    const keyOf = (ts: number) => (unit === "day" ? dayKey(ts) : unit === "week" ? weekKey(ts) : dayKey(ts).slice(0, 7));

    const buckets: TimeBucket[] = [];
    const index = new Map<string, TimeBucket>();
    let cursor = startOfDay(rangeStart);
    if (unit === "week") cursor = addDays(cursor, -((new Date(cursor * 1000).getDay() + 6) % 7));
    if (unit === "month") {
        const d = new Date(cursor * 1000);
        cursor = new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000;
    }
    for (let guard = 0; cursor < rangeEnd && guard < 2000; guard++) {
        const date = new Date(cursor * 1000);
        const bucket = {start: cursor, manual: 0, activity: 0, weekend: unit === "day" && (date.getDay() === 0 || date.getDay() === 6)};
        buckets.push(bucket);
        index.set(keyOf(cursor), bucket);
        cursor =
            unit === "day"
                ? addDays(cursor, 1)
                : unit === "week"
                  ? addDays(cursor, 7)
                  : new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() / 1000;
    }
    for (const row of manual) {
        const bucket = index.get(keyOf(row.start));
        if (bucket) bucket.manual += row.seconds;
    }
    for (const row of activity) {
        const bucket = index.get(keyOf(row.start));
        if (bucket) bucket.activity += row.seconds;
    }
    return {unit, buckets};
}

export function computeDevices(activity: ActivityRow[]): DeviceStat[] {
    const devices = new Map<string, DeviceStat>();
    for (const row of activity) {
        const stat = devices.get(row.device) ?? {name: row.device, items: 0, seconds: 0};
        stat.items += 1;
        stat.seconds += row.seconds;
        devices.set(row.device, stat);
    }
    return [...devices.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

export type RowGroup<T> = {key: string; label: string; rows: T[]; seconds: number};

/**
 * Groups detail rows for summaryGrouping. Returns a single unlabeled group for "none" (or when the
 * grouping does not apply to the dataset, e.g. manual entries by device). Day/week groups keep
 * chronological order; category/device groups are sorted by time, largest first.
 */
export function groupRows<T extends {start: number; seconds: number}>(
    rows: T[],
    grouping: SummaryGrouping,
    labelFor: (grouping: SummaryGrouping, row: T) => string | null,
): RowGroup<T>[] {
    if (grouping === "none") return [{key: "", label: "", rows, seconds: sum(rows.map(r => r.seconds))}];
    const groups = new Map<string, RowGroup<T>>();
    for (const row of rows) {
        const label = labelFor(grouping, row);
        if (label === null) return [{key: "", label: "", rows, seconds: sum(rows.map(r => r.seconds))}];
        const key = grouping === "day" ? dayKey(row.start) : grouping === "week" ? weekKey(row.start) : label;
        let group = groups.get(key);
        if (!group) {
            group = {key, label, rows: [], seconds: 0};
            groups.set(key, group);
        }
        group.rows.push(row);
        group.seconds += row.seconds;
    }
    const list = [...groups.values()];
    if (grouping === "day" || grouping === "week") return list.sort((a, b) => a.key.localeCompare(b.key));
    return list.sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

export function startOfDay(ts: number): number {
    const d = new Date(ts * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;
}

export function addDays(ts: number, days: number): number {
    const d = new Date(ts * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds()).getTime() / 1000;
}

/** Calendar days touched by [start, end). */
export function countDays(start: number, end: number): number {
    if (end <= start) return 0;
    let count = 0;
    for (let day = startOfDay(start); day < end && count < 100000; day = addDays(day, 1)) count++;
    return count;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
