import {invokeOrThrow} from "../utils.ts";

export const MANUAL_TIME_COLOR = "#0ea5e9";
export const MANUAL_TIME_LABEL = "Manual time";

export type ManualTimeBlock = {
    id: number;
    title: string;
    notes: string | null;
    project_id?: number | null;
    project_name?: string | null;
    start_time: number;
    end_time: number;
    created_at: number;
    updated_at: number;
};

export type NewManualTimeBlock = {
    title: string;
    notes?: string | null;
    project_id?: number | null;
    start_time: number;
    end_time: number;
};

export type UpdateManualTimeBlock = NewManualTimeBlock & {
    id: number;
};

export type RunningManualTimer = {
    title: string;
    notes: string | null;
    project_id?: number | null;
    start_time: number;
    end_time: number | null;
};

export async function get_manual_time_blocks(
    rangeStart: number,
    rangeEnd: number,
): Promise<ManualTimeBlock[]> {
    return invokeOrThrow<ManualTimeBlock[]>("get_manual_time_blocks", {rangeStart, rangeEnd});
}

export async function insert_manual_time_block(block: NewManualTimeBlock): Promise<number> {
    return invokeOrThrow<number>("insert_manual_time_block", {newManualTimeBlock: block});
}

export async function update_manual_time_block(block: UpdateManualTimeBlock): Promise<null> {
    return invokeOrThrow<null>("update_manual_time_block", {manualTimeBlock: block});
}

export async function delete_manual_time_block(id: number): Promise<null> {
    return invokeOrThrow<null>("delete_manual_time_block", {id});
}

export async function get_running_manual_timer(): Promise<RunningManualTimer | null> {
    return invokeOrThrow<RunningManualTimer | null>("get_running_manual_timer");
}

export async function start_manual_timer(title = "", projectId: number | null = null): Promise<RunningManualTimer> {
    return invokeOrThrow<RunningManualTimer>("start_manual_timer", {title, projectId});
}

export async function update_manual_timer_details(title: string, projectId: number | null, startTime?: number): Promise<RunningManualTimer> {
    return invokeOrThrow<RunningManualTimer>("update_manual_timer_details", {title, projectId, startTime});
}

export async function update_manual_timer_title(title: string): Promise<RunningManualTimer> {
    return invokeOrThrow<RunningManualTimer>("update_manual_timer_title", {title});
}

export async function stop_manual_timer(): Promise<RunningManualTimer> {
    return invokeOrThrow<RunningManualTimer>("stop_manual_timer");
}

export async function finish_manual_timer(): Promise<number> {
    return invokeOrThrow<number>("finish_manual_timer");
}

export function manualTimeDurationInRange(
    block: Pick<ManualTimeBlock, "start_time" | "end_time">,
    rangeStart: number,
    rangeEnd: number,
): number {
    return Math.max(0, Math.min(block.end_time, rangeEnd) - Math.max(block.start_time, rangeStart));
}

export function manualTimeAppStats(blocks: ManualTimeBlock[], start: number, end: number) {
    const durations = new Map<string, number>();
    for (const block of blocks) {
        const duration = manualTimeDurationInRange(block, start, end);
        if (duration > 0) {
            const app = `Manual time: ${block.title}`;
            durations.set(app, (durations.get(app) ?? 0) + duration);
        }
    }
    return [...durations].map(([app, total_duration]) => ({app, app_names: [] as string[], total_duration, percentage_change: null}));
}

export function manualTimeCategoryStats(blocks: ManualTimeBlock[], start: number, end: number) {
    const categories = new Map<string, {category: string; total_duration: number; color: string}>();
    const colors = [MANUAL_TIME_COLOR, "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee"];
    for (const block of blocks) {
        const duration = manualTimeDurationInRange(block, start, end);
        if (!duration) continue;
        const category = block.project_name || MANUAL_TIME_LABEL;
        const current = categories.get(category);
        categories.set(category, {category, total_duration: (current?.total_duration ?? 0) + duration, color: colors[(block.project_id ?? 0) % colors.length]});
    }
    return [...categories.values()];
}
