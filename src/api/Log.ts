import {invoke} from "@tauri-apps/api/core";
import {AppError, Result} from "../types/types.ts";

export type Log = {
    id: number,
    app: string,
    timestamp: Date,
    duration: number,
}

export async function delete_log_by_id(id: number): Promise<null | Error> {
    return await invoke("delete_log_by_id", {id});
}

export async function get_logs(): Promise<Result<Log[], AppError>> {
    let res: Log[] | AppError = await invoke("get_logs");
    if ("type" in res) {
        return {success: false, error: res};
    }
    return {success: true, data: res};

}