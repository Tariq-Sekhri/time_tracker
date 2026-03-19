import { invokeOrThrow } from "../utils.ts";

export type SkippedApp = {
    id: number;
    regex: string;
};

export type NewSkippedApp = {
    regex: string;
};

export async function get_skipped_apps(): Promise<SkippedApp[]> {
    return invokeOrThrow<SkippedApp[]>("get_skipped_apps");
}

export async function count_matching_logs(regex_pattern: string): Promise<number> {
    return invokeOrThrow<number>("count_matching_logs", { regexPattern: regex_pattern });
}

export async function insert_skipped_app(newApp: NewSkippedApp): Promise<number> {
    return invokeOrThrow<number>("insert_skipped_app", { newApp });
}

export async function insert_skipped_app_and_delete_logs(newApp: NewSkippedApp): Promise<number> {
    return invokeOrThrow<number>("insert_skipped_app_and_delete_logs", { newApp });
}

export async function update_skipped_app_by_id(skippedApp: SkippedApp): Promise<null> {
    return invokeOrThrow<null>("update_skipped_app_by_id", { skippedApp });
}

export async function delete_skipped_app_by_id(id: number): Promise<null> {
    return invokeOrThrow<null>("delete_skipped_app_by_id", { id });
}

export async function restore_default_skipped_apps(): Promise<null> {
    return invokeOrThrow<null>("restore_default_skipped_apps");
}
