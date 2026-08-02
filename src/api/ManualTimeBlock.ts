import {invokeOrThrow} from "../utils.ts";

export const MANUAL_TIME_COLOR = "#0ea5e9";
export const MANUAL_TIME_LABEL = "Manual time";

export type ManualTimeBlock = {
    id: number;
    title: string;
    notes: string | null;
    start_time: number;
    end_time: number;
    created_at: number;
    updated_at: number;
};

export type NewManualTimeBlock = {
    title: string;
    notes?: string | null;
    start_time: number;
    end_time: number;
};

export type UpdateManualTimeBlock = NewManualTimeBlock & {
    id: number;
};

export type RunningManualTimer = {
    title: string;
    notes: string | null;
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

export async function start_manual_timer(): Promise<RunningManualTimer> {
    return invokeOrThrow<RunningManualTimer>("start_manual_timer");
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
