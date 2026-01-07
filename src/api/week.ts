import { invokeWithResult, getWeekRange } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

// Backend returns snake_case, but we use camelCase in frontend
type TimeBlockBackend = {
    id: number;
    category: string;
    start_time: number; // Unix timestamp in seconds
    end_time: number; // Unix timestamp in seconds
    apps: { app: string; total_duration: number }[];
};

export type TimeBlock = {
    id: number;
    category: string;
    startTime: number; // Unix timestamp in seconds
    endTime: number; // Unix timestamp in seconds
    apps: { app: string; totalDuration: number }[];
};

function transformTimeBlock(block: TimeBlockBackend): TimeBlock {
    return {
        id: block.id,
        category: block.category,
        startTime: block.start_time,
        endTime: block.end_time,
        apps: block.apps.map(app => ({
            app: app.app,
            totalDuration: app.total_duration,
        })),
    };
}

export async function get_week(date: Date): Promise<Result<TimeBlock[], AppError>> {
    const { week_start, week_end } = getWeekRange(date);
    const result = await invokeWithResult<TimeBlockBackend[]>("get_week", {
        weekStart: week_start,
        weekEnd: week_end,
    });

    if (result.success) {
        return {
            success: true,
            data: result.data.map(transformTimeBlock),
        };
    }
    return result;
}

