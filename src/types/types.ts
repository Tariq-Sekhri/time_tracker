import {invoke} from "@tauri-apps/api/core";


export type Result<D, E> =
    { success: true, data: D } |
    { success: false, error: E };

export async function invokeWithResult<T>(
    command: string,
    args?: Record<string, any>
): Promise<Result<T, AppError>> {
    const res: T | AppError = await invoke(command, args);
    if (res != null && typeof res == "object" && "type" in res) {
        return {success: false, error: res};
    }
    return {success: true, data: res};
}

export type AppError =
    | { type: "Db"; data: string }
    | { type: "NotFound" }
    | { type: "Other"; data: string };


export type TimeBlock = {
    id: number,
    category: string,
    startTime: Date
    endTime: Date,
    apps: { app: string, duration: number }[]
}

function getWeekRange(date: Date): {
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

export async function get_week(): Promise<Result<TimeBlock[], AppError>> {
    const {week_start, week_end} = getWeekRange(new Date());
    return invokeWithResult<TimeBlock[]>("get_week", {
        weekStart: week_start,
        weekEnd: week_end,
    });
}

