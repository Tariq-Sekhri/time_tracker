import type {DateFormat, DurationFormat, Rounding, RoundingMode, TimeFormat} from "../types.ts";

/** Rounds a duration (seconds) to whole multiples of `rounding` minutes. 0 keeps it exact. */
export function roundDuration(seconds: number, rounding: Rounding, mode: RoundingMode): number {
    if (!rounding || seconds <= 0) return Math.max(0, Math.round(seconds));
    const step = rounding * 60;
    const units = seconds / step;
    const rounded = mode === "up" ? Math.ceil(units) : mode === "down" ? Math.floor(units) : Math.round(units);
    return rounded * step;
}

/** "1:02:03" (hms), "1:02" (hm) or "1.03" (decimal hours, 2 places). */
export function formatDuration(seconds: number, format: DurationFormat): string {
    const total = Math.max(0, Math.round(seconds));
    if (format === "decimal") return (total / 3600).toFixed(2);
    if (format === "hm") {
        const minutes = Math.round(total / 60);
        return `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}`;
    }
    return `${Math.floor(total / 3600)}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

/** Short human label for reports, e.g. "3h 05m", "45m", "0m". */
export function humanDuration(seconds: number): string {
    const totalMinutes = Math.round(Math.max(0, seconds) / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes}m`;
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Local date. iso: 2026-03-04, us: 03/04/2026, eu: 04/03/2026. */
export function formatDate(timestamp: number, format: DateFormat): string {
    const date = new Date(timestamp * 1000);
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    if (format === "us") return `${m}/${d}/${y}`;
    if (format === "eu") return `${d}/${m}/${y}`;
    return `${y}-${m}-${d}`;
}

/** Local time. 24h: 14:05:09, 12h: 2:05:09 PM. */
export function formatTime(timestamp: number, format: TimeFormat): string {
    const date = new Date(timestamp * 1000);
    const minutes = pad2(date.getMinutes());
    const seconds = pad2(date.getSeconds());
    if (format === "12h") {
        const hours = date.getHours();
        return `${hours % 12 || 12}:${minutes}:${seconds} ${hours < 12 ? "AM" : "PM"}`;
    }
    return `${pad2(date.getHours())}:${minutes}:${seconds}`;
}

export function formatDateTime(timestamp: number, dateFormat: DateFormat, timeFormat: TimeFormat): string {
    return `${formatDate(timestamp, dateFormat)} ${formatTime(timestamp, timeFormat)}`;
}

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(timestamp: number): string {
    return formatDate(timestamp, "iso");
}

/** Monday of the timestamp's local week, YYYY-MM-DD. */
export function weekKey(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const offset = (date.getDay() + 6) % 7;
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
    return dayKey(Math.floor(monday.getTime() / 1000));
}

/** "Mar 4, 2026 – Mar 10, 2026" for an inclusive start / exclusive end range. */
export function rangeLabel(rangeStart: number, rangeEnd: number): string {
    const options: Intl.DateTimeFormatOptions = {month: "short", day: "numeric", year: "numeric"};
    const start = new Date(rangeStart * 1000).toLocaleDateString("en-US", options);
    const end = new Date((rangeEnd - 1) * 1000).toLocaleDateString("en-US", options);
    return start === end ? start : `${start} – ${end}`;
}

/** File-name-safe stem: "Time report 2026-03" → "time-report-2026-03". */
export function safeFileStem(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
}
