import type {MobileLog, Settings, Usage} from "./api";

export function dayStart(date: Date, hour: number): Date {
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    if (start > date) start.setDate(start.getDate() - 1);
    return start;
}
export function nextDay(date: Date): Date {
    const next = new Date(date); next.setDate(next.getDate() + 1); return next;
}
export function dateValue(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateAtHour(value: string, hour: number): Date {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, hour);
}
export function rangeFor(period: string, now: Date, hour: number, customStart: string, customEnd: string) {
    const start = dayStart(now, hour);
    const end = nextDay(start);
    if (period === "Week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (period === "Month") start.setDate(1);
    if (period === "Custom") return {startMs: dateAtHour(customStart, hour).getTime(), endMs: nextDay(dateAtHour(customEnd, hour)).getTime()};
    return {startMs: start.getTime(), endMs: end.getTime()};
}
export function rangeDayCount(startMs: number, endMs: number, hour: number): number {
    const first = dayStart(new Date(startMs), hour), last = dayStart(new Date(endMs - 1), hour);
    const utcDate = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(1, Math.round((utcDate(last) - utcDate(first)) / 86400000) + 1);
}
export function colorFor(value: string) {
    let hash = 0; for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return `hsl(${Math.abs(hash) % 360} 65% 65%)`;
}
export function duration(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
    if (h) return m ? `${h}h ${m}m` : `${h}h`;
    if (m) return m < 10 && s ? `${m}m ${s}s` : `${m}m`;
    return `${s}s`;
}
export function clipLog(log: MobileLog, start: number, end: number) {
    const from = Math.max(start, log.start_timestamp);
    const to = Math.min(end, log.end_timestamp ?? log.start_timestamp + log.duration * 1000);
    return {...log, start_timestamp: from, end_timestamp: to, duration: Math.min(log.duration, Math.max(0, (to - from) / 1000))};
}
export type Block = {id: string; packageName: string; title: string; start: number; end: number; activeSeconds: number; logs: MobileLog[]};
export function calendarBlocks(logs: MobileLog[], start: number, end: number, settings: Settings): Block[] {
    const blocks: Block[] = [];
    for (const log of logs.map(log => clipLog(log, start, end)).filter(log => log.duration >= settings.min_log_duration).sort((a, b) => a.start_timestamp - b.start_timestamp)) {
        const last = [...blocks].reverse().find(block => block.packageName === log.package_name && log.start_timestamp - block.end <= settings.max_attach_distance * 1000);
        if (last) {
            last.end = Math.max(last.end, log.end_timestamp!); last.activeSeconds += log.duration; last.logs.push(log);
        } else blocks.push({id: String(log.id), packageName: log.package_name, title: log.app_name, start: log.start_timestamp, end: log.end_timestamp!, activeSeconds: log.duration, logs: [log]});
    }
    const merged: Block[] = [];
    for (const block of blocks) {
        const existing = [...merged].reverse().find(previous => previous.packageName === block.packageName && block.start - previous.end <= settings.lookahead_window * 1000);
        if (existing) { existing.end = Math.max(existing.end, block.end); existing.activeSeconds += block.activeSeconds; existing.logs.push(...block.logs); }
        else merged.push(block);
    }
    return merged.filter(block => block.activeSeconds >= settings.min_timeblock_duration);
}

export const palette = ["#b18bff", "#4fc3a1", "#f2b45c", "#6aa8ff", "#ef7aa1", "#9ad86b", "#ff8f6b", "#5fd0e6"];
export function manualUsage(entries: {project_name: string | null; start_time: number; end_time: number}[], startMs: number, endMs: number, hour: number): Usage {
    const groups = new Map<string, number>(), days = new Map<string, number>();
    let total = 0;
    for (const entry of entries) {
        const from = Math.max(startMs, entry.start_time * 1000), to = Math.min(endMs, entry.end_time * 1000);
        if (to <= from) continue;
        const name = entry.project_name || "Uncategorized";
        groups.set(name, (groups.get(name) ?? 0) + (to - from) / 1000);
        total += (to - from) / 1000;
        for (let day = dayStart(new Date(from), hour); +day < to; day = nextDay(day)) {
            const a = Math.max(from, +day), b = Math.min(to, +nextDay(day));
            if (b > a) days.set(dateValue(day), (days.get(dateValue(day)) ?? 0) + (b - a) / 1000);
        }
    }
    const dayList: Usage["days"] = [];
    for (let day = dayStart(new Date(startMs), hour); +day < endMs; day = nextDay(day)) dayList.push({date: dateValue(day), seconds: days.get(dateValue(day)) ?? 0});
    return {total, apps: [...groups].map(([label, seconds]) => ({packageName: label, label, seconds})).sort((a, b) => b.seconds - a.seconds), days: dayList};
}
