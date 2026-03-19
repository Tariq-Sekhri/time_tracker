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
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
        week_start: Math.floor(monday.getTime() / 1000),
        week_end: Math.floor(sunday.getTime() / 1000),
    };
}





