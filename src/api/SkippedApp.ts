import { invokeWithResult } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

export type SkippedApp = {
    id: number;
    regex: string;
};

export type NewSkippedApp = {
    regex: string;
};

export async function get_skipped_apps(): Promise<Result<SkippedApp[], AppError>> {
    return invokeWithResult<SkippedApp[]>("get_skipped_apps");
}

export async function count_matching_logs(regex_pattern: string): Promise<Result<number, AppError>> {
    return invokeWithResult<number>("count_matching_logs", { regexPattern: regex_pattern });
}

export async function insert_skipped_app(newApp: NewSkippedApp): Promise<Result<number, AppError>> {
    return invokeWithResult<number>("insert_skipped_app", { newApp });
}

export async function insert_skipped_app_and_delete_logs(newApp: NewSkippedApp): Promise<Result<number, AppError>> {
    return invokeWithResult<number>("insert_skipped_app_and_delete_logs", { newApp });
}

export async function update_skipped_app_by_id(skippedApp: SkippedApp): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("update_skipped_app_by_id", { skippedApp });
}

export async function delete_skipped_app_by_id(id: number): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("delete_skipped_app_by_id", { id });
}

export async function restore_default_skipped_apps(): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("restore_default_skipped_apps");
}
