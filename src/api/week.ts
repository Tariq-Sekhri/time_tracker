import { invokeOrThrow } from "../utils.ts";

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

export async function get_week(
    date: Date
): Promise<TimeBlock[]> {
    const weekAnchor = Math.floor(date.getTime() / 1000);
    const result = await invokeOrThrow<TimeBlockBackend[]>("get_week", {
        weekAnchor,
    });
    return result.map(transformTimeBlock);
}

export async function get_week_for_app_filter(
    date: Date,
    appName: string
): Promise<TimeBlock[]> {
    const weekAnchor = Math.floor(date.getTime() / 1000);
    const result = await invokeOrThrow<TimeBlockBackend[]>("get_week_for_app_filter", {
        weekAnchor,
        appName,
    });
    return result.map(transformTimeBlock);
}

