import { invokeOrThrow } from "../utils.ts";
import { storageKey } from "../storageKey.ts";

export type CalendarViewPrefsV1 = {
    includeGoogleInStats: boolean;
    visibleCategories: string[];
    knownCategories: string[];
    visibleCalendars: number[];
    knownCalendars: number[];
    googleCalendarsInStats: number[];
    knownGoogleCalendarsInStats: number[];
};

export const LEGACY_INCLUDE_GOOGLE_STATS_KEY = storageKey("time-tracker:include-google-in-stats");

const LEGACY_KEYS = [
    LEGACY_INCLUDE_GOOGLE_STATS_KEY,
    storageKey("visibleCategories"),
    storageKey("knownCategories"),
    storageKey("visibleCalendars"),
    storageKey("knownCalendars"),
    storageKey("googleCalendarsInStats"),
    storageKey("knownGoogleCalendarsInStats"),
] as const;

function defaultCalendarViewPrefs(): CalendarViewPrefsV1 {
    return {
        includeGoogleInStats: false,
        visibleCategories: [],
        knownCategories: [],
        visibleCalendars: [],
        knownCalendars: [],
        googleCalendarsInStats: [],
        knownGoogleCalendarsInStats: [],
    };
}

function readLegacyCalendarViewPrefs(): CalendarViewPrefsV1 | null {
    try {
        const hasAny = LEGACY_KEYS.some((k) => localStorage.getItem(k) != null);
        if (!hasAny) return null;
        const includeRaw = localStorage.getItem(LEGACY_INCLUDE_GOOGLE_STATS_KEY);
        let includeGoogleInStats = false;
        if (includeRaw === "1") includeGoogleInStats = true;
        else if (includeRaw === "0") includeGoogleInStats = false;
        const parseArr = (key: string): unknown => {
            const raw = localStorage.getItem(storageKey(key));
            if (!raw) return [];
            return JSON.parse(raw) as unknown;
        };
        const asStringArr = (v: unknown): string[] =>
            Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
        const asNumArr = (v: unknown): number[] =>
            Array.isArray(v)
                ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
                : [];
        return {
            includeGoogleInStats,
            visibleCategories: asStringArr(parseArr("visibleCategories")),
            knownCategories: asStringArr(parseArr("knownCategories")),
            visibleCalendars: asNumArr(parseArr("visibleCalendars")),
            knownCalendars: asNumArr(parseArr("knownCalendars")),
            googleCalendarsInStats: asNumArr(parseArr("googleCalendarsInStats")),
            knownGoogleCalendarsInStats: asNumArr(parseArr("knownGoogleCalendarsInStats")),
        };
    } catch {
        return null;
    }
}

function clearLegacyCalendarViewPrefs(): void {
    try {
        for (const k of LEGACY_KEYS) {
            localStorage.removeItem(k);
        }
    } catch (e) {
        console.error("[calendarViewPrefs] Failed to clear legacy localStorage keys:", e);
    }
}

function parseStoredPrefs(raw: string): CalendarViewPrefsV1 | null {
    try {
        const p = JSON.parse(raw) as Partial<CalendarViewPrefsV1>;
        if (!p || typeof p !== "object") return null;
        return {
            includeGoogleInStats: !!p.includeGoogleInStats,
            visibleCategories: Array.isArray(p.visibleCategories)
                ? p.visibleCategories.filter((x) => typeof x === "string")
                : [],
            knownCategories: Array.isArray(p.knownCategories)
                ? p.knownCategories.filter((x) => typeof x === "string")
                : [],
            visibleCalendars: Array.isArray(p.visibleCalendars)
                ? p.visibleCalendars.filter(
                      (x): x is number => typeof x === "number" && Number.isFinite(x)
                  )
                : [],
            knownCalendars: Array.isArray(p.knownCalendars)
                ? p.knownCalendars.filter(
                      (x): x is number => typeof x === "number" && Number.isFinite(x)
                  )
                : [],
            googleCalendarsInStats: Array.isArray(p.googleCalendarsInStats)
                ? p.googleCalendarsInStats.filter(
                      (x): x is number => typeof x === "number" && Number.isFinite(x)
                  )
                : [],
            knownGoogleCalendarsInStats: Array.isArray(p.knownGoogleCalendarsInStats)
                ? p.knownGoogleCalendarsInStats.filter(
                      (x): x is number => typeof x === "number" && Number.isFinite(x)
                  )
                : [],
        };
    } catch {
        return null;
    }
}

export async function loadCalendarViewPrefs(): Promise<CalendarViewPrefsV1> {
    const raw = await invokeOrThrow<string | null>("get_calendar_view_prefs");
    if (raw) {
        const parsed = parseStoredPrefs(raw);
        if (parsed) return parsed;
    }
    const legacy = readLegacyCalendarViewPrefs();
    if (legacy) {
        try {
            await invokeOrThrow("set_calendar_view_prefs", { json: JSON.stringify(legacy) });
            clearLegacyCalendarViewPrefs();
        } catch (e) {
            console.error("[calendarViewPrefs] Failed to persist migrated prefs:", e);
        }
        return legacy;
    }
    return defaultCalendarViewPrefs();
}

export async function saveCalendarViewPrefs(prefs: CalendarViewPrefsV1): Promise<void> {
    try {
        await invokeOrThrow("set_calendar_view_prefs", { json: JSON.stringify(prefs) });
    } catch (e) {
        console.error("[calendarViewPrefs] Failed to save calendar view prefs:", e);
        throw e;
    }
}
