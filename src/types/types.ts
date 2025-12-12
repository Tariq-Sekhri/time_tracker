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


export type CategoryRegex = {
    id: number,
    cat_id: number,
    regex: string,
}

