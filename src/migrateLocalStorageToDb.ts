import { getAppMetadata, setAppMetadata } from "./api/appMetadata.ts";

const KEYS = [
    "time-tracker:settings",
    "time-tracker:right-sidebar-collapsed",
    "time-tracker:left-sidebar-collapsed",
    "time-tracker:cat-regex:visible-category-ids",
    "time-tracker:cat-regex:known-category-ids",
    "time-tracker:cat-regex:sort-order",
    "time-tracker:cat-regex:group-by-category",
] as const;

export async function migrateLocalStorageToDb(): Promise<void> {
    for (const key of KEYS) {
        let raw: string | null = null;
        try {
            raw = localStorage.getItem(key) ?? localStorage.getItem(`dev:${key}`);
        } catch {
            raw = null;
        }
        if (raw == null) continue;

        try {
            const existing = await getAppMetadata(key);
            if (existing == null) {
                await setAppMetadata(key, raw);
            }
        } catch {
        }

        try {
            localStorage.removeItem(key);
            localStorage.removeItem(`dev:${key}`);
        } catch {
        }
    }
}

