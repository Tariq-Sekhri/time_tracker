import { invokeOrThrow } from "../utils.ts";

export async function getAppMetadata(key: string): Promise<string | null> {
    return invokeOrThrow<string | null>("get_app_metadata", { key });
}

export async function setAppMetadata(key: string, value: string): Promise<void> {
    await invokeOrThrow("set_app_metadata", { key, value });
}

export async function deleteAppMetadata(key: string): Promise<void> {
    await invokeOrThrow("delete_app_metadata", { key });
}

