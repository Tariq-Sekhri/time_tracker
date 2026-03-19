import { invokeOrThrow } from "../utils.ts";

export type Log = {
    id: number;
    app: string;
    timestamp: Date;
    duration: number;
};

export type MergedLog = {
    ids: number[];
    app: string;
    timestamp: number; // Unix timestamp in seconds
    duration: number;
};

export type DeleteTimeBlockRequest = {
    app_names: string[];
    start_time: number;
    end_time: number;
};

export type GetLogsByCategoryRequest = {
    category: string;
    start_time: number;
    end_time: number;
};

export async function delete_log_by_id(id: number): Promise<null> {
    return invokeOrThrow<null>("delete_log_by_id", { id });
}

export async function get_logs(): Promise<Log[]> {
    return invokeOrThrow<Log[]>("get_logs");
}

export async function get_log_by_id(id: number): Promise<Log> {
    return invokeOrThrow<Log>("get_log_by_id", { id });
}

export async function delete_logs_for_time_block(request: DeleteTimeBlockRequest): Promise<number> {
    return invokeOrThrow<number>("delete_logs_for_time_block", { request });
}

export async function count_logs_for_time_block(request: DeleteTimeBlockRequest): Promise<number> {
    return invokeOrThrow<number>("count_logs_for_time_block", { request });
}

export async function get_logs_for_time_block(request: DeleteTimeBlockRequest): Promise<MergedLog[]> {
    return invokeOrThrow<MergedLog[]>("get_logs_for_time_block", { request });
}

export async function delete_logs_by_ids(ids: number[]): Promise<null> {
    return invokeOrThrow<null>("delete_logs_by_ids", { ids });
}

export async function get_logs_by_category(request: GetLogsByCategoryRequest): Promise<MergedLog[]> {
    return invokeOrThrow<MergedLog[]>("get_logs_by_category", { request });
}



