import { invokeWithResult } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

export type Log = {
    id: number;
    app: string;
    timestamp: Date;
    duration: number;
};

export async function delete_log_by_id(id: number): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("delete_log_by_id", {id});
}

export async function get_logs(): Promise<Result<Log[], AppError>> {
    return invokeWithResult<Log[]>("get_logs");
}

export async function get_log_by_id(id: number): Promise<Result<Log, AppError>> {
    return invokeWithResult<Log>("get_log_by_id", {id});
}

