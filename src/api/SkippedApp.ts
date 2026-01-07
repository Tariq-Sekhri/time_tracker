import { invokeWithResult } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

export type SkippedApp = {
    id: number;
    app_name: string;
};

export type NewSkippedApp = {
    app_name: string;
};

export async function get_skipped_apps(): Promise<Result<SkippedApp[], AppError>> {
    return invokeWithResult<SkippedApp[]>("get_skipped_apps");
}

export async function insert_skipped_app(newApp: NewSkippedApp): Promise<Result<number, AppError>> {
    return invokeWithResult<number>("insert_skipped_app", { newApp });
}

export async function delete_skipped_app_by_id(id: number): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("delete_skipped_app_by_id", { id });
}

