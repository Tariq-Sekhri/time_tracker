import { invoke } from "@tauri-apps/api/core";

export async function invokeOrThrow<T>(
    command: string,
    args?: Record<string, any>
): Promise<T> {
    return await invoke<T>(command, args);
}

/**
 * Calculate the start and end timestamps for the week containing the given date
 * Week starts on Monday and ends on Sunday
 */
export function getWeekRange(date: Date): {
    week_start: number;
    week_end: number;
} {
    const y = date.getFullYear();
    const m = date.getMonth();
    const day = date.getDate();
    const dow = date.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(y, m, day + offsetToMonday, 0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
        week_start: Math.floor(monday.getTime() / 1000),
        week_end: Math.floor(sunday.getTime() / 1000),
    };
}

export function getCalendarDayRangeUnix(
    calendarDate: Date,
    calendarStartHour: number
): { day_start: number; day_end: number } {
    const hour = Number.isFinite(calendarStartHour)
        ? Math.min(23, Math.max(0, Math.floor(calendarStartHour)))
        : 6;
    const start = new Date(calendarDate);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(-1);
    return {
        day_start: Math.floor(start.getTime() / 1000),
        day_end: Math.floor(end.getTime() / 1000),
    };
}




