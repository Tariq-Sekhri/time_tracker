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
export function getWeekRange(
    date: Date,
    calendarStartHour: number = 6
): {
    week_start: number;
    week_end: number;
} {
    const h = Number.isFinite(calendarStartHour)
        ? Math.min(23, Math.max(0, Math.floor(calendarStartHour)))
        : 6;

    const y = date.getFullYear();
    const m = date.getMonth();
    const day = date.getDate();
    const dow = date.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const mondayCal = new Date(y, m, day + offsetToMonday, 0, 0, 0, 0);

    const weekStart = new Date(mondayCal);
    weekStart.setHours(h, 0, 0, 0);

    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setDate(weekEndExclusive.getDate() + 7);

    const week_end = Math.floor(weekEndExclusive.getTime() / 1000) - 1;

    return {
        week_start: Math.floor(weekStart.getTime() / 1000),
        week_end,
    };
}

export function adjustInstantToCalendarDayBoundary(
    d: Date,
    calendarStartHour: number
): Date {
    const h = Number.isFinite(calendarStartHour)
        ? Math.min(23, Math.max(0, Math.floor(calendarStartHour)))
        : 6;
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const boundary = new Date(y, m, day, h, 0, 0, 0);
    if (d.getTime() < boundary.getTime()) {
        return new Date(y, m, day - 1, 12, 0, 0, 0);
    }
    return new Date(y, m, day, 12, 0, 0, 0);
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

export function getWeekStartDate(date: Date, calendarStartHour: number): Date {
    const { week_start } = getWeekRange(date, calendarStartHour);
    return new Date(week_start * 1000);
}

export function enumerateWeekRangesInSpan(
    rangeStart: Date,
    rangeEnd: Date,
    calendarStartHour: number,
    maxWeeks = 24
): { week_start: number; week_end: number }[] {
    let cursor = getWeekStartDate(rangeStart, calendarStartHour);
    const endCursor = getWeekStartDate(rangeEnd, calendarStartHour);
    const out: { week_start: number; week_end: number }[] = [];
    while (cursor.getTime() <= endCursor.getTime()) {
        out.push(getWeekRange(cursor, calendarStartHour));
        const next = new Date(cursor);
        next.setDate(next.getDate() + 7);
        cursor = getWeekStartDate(next, calendarStartHour);
    }
    if (out.length > maxWeeks) {
        return out.slice(out.length - maxWeeks);
    }
    return out;
}

