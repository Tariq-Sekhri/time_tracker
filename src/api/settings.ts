import { invokeOrThrow } from "../utils.ts";

export type Setting = {
    key: string;
    val: number;
    is_locked: boolean;
    default_val: number;
    min_val: number | null;
    max_val: number | null;
};

export async function getSettings(): Promise<Setting[]> {
    return invokeOrThrow<Setting[]>("get_settings");
}

export async function updateSettingVal(key: string, val: number): Promise<void> {
    await invokeOrThrow("update_val_by_key", { key, newVal: val });
}

export async function flipSettingLock(key: string): Promise<void> {
    await invokeOrThrow("flip_lock_by_key", { key });
}

export async function resetSettingVal(key: string): Promise<void> {
    await invokeOrThrow("reset_val_by_key", { key });
}
