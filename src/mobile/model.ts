import type {MobileLog, Settings} from "./api";

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
export function colorFor(value: string) {
    let hash = 0; for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return `hsl(${Math.abs(hash) % 360} 65% 65%)`;
}
export function duration(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
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
