/*
 * Date range presets for the export screen. Pure and local-time based:
 * every range starts at local midnight and ends (exclusive) at a later local midnight,
 * built with the Date(y, m, d) constructor so daylight-saving shifts stay correct.
 * Weeks start on Monday.
 */

export type RangePreset =
    | "today"
    | "this_week"
    | "last_week"
    | "this_month"
    | "last_month"
    | "this_quarter"
    | "this_year"
    | "last_30_days"
    | "all_time"
    | "custom";

export type RangeSelection = {
    preset: RangePreset;
    /** YYYY-MM-DD, inclusive. Used by "custom". */
    customStart: string;
    /** YYYY-MM-DD, inclusive (the export end is the next day's midnight). Used by "custom". */
    customEnd: string;
};

/** Unix seconds; start inclusive, end exclusive. */
export type ResolvedRange = {start: number; end: number};

export type DataBounds = {data_start: number | null; data_end: number | null};

export const RANGE_PRESETS: {id: RangePreset; label: string}[] = [
    {id: "today", label: "Today"},
    {id: "this_week", label: "This week"},
    {id: "last_week", label: "Last week"},
    {id: "this_month", label: "This month"},
    {id: "last_month", label: "Last month"},
    {id: "this_quarter", label: "This quarter"},
    {id: "this_year", label: "This year"},
    {id: "last_30_days", label: "Last 30 days"},
    {id: "all_time", label: "All time"},
    {id: "custom", label: "Custom"},
];

export const RANGE_PRESET_IDS = RANGE_PRESETS.map((item) => item.id);

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const pad2 = (value: number) => String(value).padStart(2, "0");

/** Local YYYY-MM-DD for a date input. */
export function toDateInput(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parses a YYYY-MM-DD date input as local midnight; null when invalid. */
export function fromDateInput(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
}

export function defaultRangeSelection(now: Date = new Date()): RangeSelection {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {preset: "this_month", customStart: toDateInput(monthStart), customEnd: toDateInput(now)};
}

/** Explains why a custom range is unusable, or null when it is valid (or not custom). */
export function rangeError(selection: RangeSelection): string | null {
    if (selection.preset !== "custom") return null;
    const start = fromDateInput(selection.customStart);
    const end = fromDateInput(selection.customEnd);
    if (!start && !end) return "Pick a start and end date.";
    if (!start) return "Pick a valid start date.";
    if (!end) return "Pick a valid end date.";
    if (end < start) return "The end date is before the start date.";
    return null;
}

/** Resolves a selection to unix seconds. Returns null for an invalid custom range. */
export function resolveRange(selection: RangeSelection, now: Date = new Date(), bounds: DataBounds = {data_start: null, data_end: null}): ResolvedRange | null {
    const today = startOfDay(now);
    const span = (from: Date, toExclusive: Date): ResolvedRange => ({start: seconds(from), end: seconds(toExclusive)});
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    switch (selection.preset) {
        case "today":
            return span(today, addDays(today, 1));
        case "this_week":
            return span(monday, addDays(monday, 7));
        case "last_week":
            return span(addDays(monday, -7), monday);
        case "this_month":
            return span(new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1));
        case "last_month":
            return span(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 1));
        case "this_quarter": {
            const quarterMonth = Math.floor(today.getMonth() / 3) * 3;
            return span(new Date(today.getFullYear(), quarterMonth, 1), new Date(today.getFullYear(), quarterMonth + 3, 1));
        }
        case "this_year":
            return span(new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear() + 1, 0, 1));
        case "last_30_days":
            return span(addDays(today, -29), addDays(today, 1));
        case "all_time": {
            const first = bounds.data_start != null ? startOfDay(new Date(bounds.data_start * 1000)) : today;
            const lastData = bounds.data_end != null ? startOfDay(new Date(bounds.data_end * 1000)) : today;
            const last = lastData > today ? lastData : today;
            return span(first < today ? first : today, addDays(last, 1));
        }
        case "custom": {
            if (rangeError(selection)) return null;
            const start = fromDateInput(selection.customStart)!;
            const end = fromDateInput(selection.customEnd)!;
            return span(start, addDays(end, 1));
        }
    }
}

/** Number of calendar days covered by a resolved range. */
export function rangeDayCount(range: ResolvedRange): number {
    return Math.max(1, Math.round((range.end - range.start) / 86400));
}

/** "Mar 1 – Mar 31, 2026 · 31 days", "Dec 29, 2025 – Jan 4, 2026 · 7 days", "Mar 4, 2026 · 1 day". */
export function describeRange(range: ResolvedRange): string {
    const start = new Date(range.start * 1000);
    const last = new Date((range.end - 1) * 1000);
    const days = rangeDayCount(range);
    const dayText = `${days.toLocaleString("en-US")} ${days === 1 ? "day" : "days"}`;
    const full: Intl.DateTimeFormatOptions = {month: "short", day: "numeric", year: "numeric"};
    if (toDateInput(start) === toDateInput(last)) return `${start.toLocaleDateString("en-US", full)} · ${dayText}`;
    const sameYear = start.getFullYear() === last.getFullYear();
    const startText = start.toLocaleDateString("en-US", sameYear ? {month: "short", day: "numeric"} : full);
    return `${startText} – ${last.toLocaleDateString("en-US", full)} · ${dayText}`;
}

/** Compact range text for sentences: "Mar 1 – Mar 31, 2026". */
export function shortRangeText(range: ResolvedRange): string {
    return describeRange(range).split(" · ")[0];
}
