import { invokeWithResult, getWeekRange } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

export type TimeBlock = {
    id: number;
    category: string;
    startTime: Date;
    endTime: Date;
    apps: { app: string; duration: number }[];
};

export async function get_week(): Promise<Result<TimeBlock[], AppError>> {
    const { week_start, week_end } = getWeekRange(new Date());
    return invokeWithResult<TimeBlock[]>("get_week", {
        weekStart: week_start,
        weekEnd: week_end,
    });
}

