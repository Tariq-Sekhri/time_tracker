import { create } from "zustand";
import { storageKey } from "../storageKey.ts";

export type TimeBlockSettings = {
    minLogDuration: number;
    maxAttachDistance: number;
    lookaheadWindow: number;
    minDuration: number;
};

export type SettingsFieldKey =
    | "calendarStartHour"
    | "calendarHeight"
    | "rightSidebarWidth"
    | "categorySidebarCount"
    | "minLogDuration"
    | "maxAttachDistance"
    | "lookaheadWindow"
    | "minDuration"
    | "uiMinAppDuration";

export type FieldLocks = Record<SettingsFieldKey, boolean>;

export type PersistedSettings = {
    calendarStartHour: number;
    calendarHeight: number;
    rightSidebarWidth: number;
    timeBlockSettings: TimeBlockSettings;
    uiMinAppDuration: number;
    categorySidebarCount: number;
    fieldLocks: FieldLocks;
};

export type SettingsState = PersistedSettings & {
    setCalendarStartHour: (hour: number) => void;
    setCalendarHeight: (height: number) => void;
    setRightSidebarWidth: (width: number) => void;
    setTimeBlockSettings: (patch: Partial<TimeBlockSettings>) => void;
    setUiMinAppDuration: (seconds: number) => void;
    setCategorySidebarCount: (count: number) => void;
    toggleFieldLock: (key: SettingsFieldKey) => void;
    resetField: (key: SettingsFieldKey) => void;
    resetSettings: () => void;
};

const STORAGE_KEY = storageKey("time-tracker:settings");

export const RIGHT_SIDEBAR_WIDTH_MIN = 280;
export const RIGHT_SIDEBAR_WIDTH_MAX = 800;
export const CALENDAR_HEIGHT_MIN = 50;
export const CALENDAR_HEIGHT_MAX = 200;

const DEFAULT_FIELD_LOCKS: FieldLocks = {
    calendarStartHour: false,
    calendarHeight: false,
    rightSidebarWidth: false,
    categorySidebarCount: false,
    minLogDuration: false,
    maxAttachDistance: false,
    lookaheadWindow: false,
    minDuration: false,
    uiMinAppDuration: false,
};

const DEFAULT_SETTINGS: PersistedSettings = {
    calendarStartHour: 6,
    calendarHeight: 100,
    rightSidebarWidth: 480,
    timeBlockSettings: {
        minLogDuration: 60,
        maxAttachDistance: 600,
        lookaheadWindow: 600,
        minDuration: 60,
    },
    uiMinAppDuration: 60,
    categorySidebarCount: 5,
    fieldLocks: { ...DEFAULT_FIELD_LOCKS },
};

function isFiniteNumber(n: unknown): n is number {
    return typeof n === "number" && Number.isFinite(n);
}

function clampInt(value: number, min: number, max: number): number {
    const v = Math.floor(value);
    return Math.min(max, Math.max(min, v));
}

function normalizeFieldLocks(raw: unknown): FieldLocks {
    const out: FieldLocks = { ...DEFAULT_FIELD_LOCKS };
    if (!raw || typeof raw !== "object") return out;
    const o = raw as Record<string, unknown>;
    (Object.keys(DEFAULT_FIELD_LOCKS) as SettingsFieldKey[]).forEach((k) => {
        if (o[k] === true) out[k] = true;
    });
    return out;
}

function loadStoredSettings(): PersistedSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as any;

        const calendarStartHour = isFiniteNumber(parsed?.calendarStartHour)
            ? clampInt(parsed.calendarStartHour, 0, 23)
            : DEFAULT_SETTINGS.calendarStartHour;
        const rawCalendarHeight = parsed?.calendarHeight;
        const calendarHeight = isFiniteNumber(rawCalendarHeight)
            ? rawCalendarHeight > 300
                ? DEFAULT_SETTINGS.calendarHeight
                : clampInt(rawCalendarHeight, CALENDAR_HEIGHT_MIN, CALENDAR_HEIGHT_MAX)
            : DEFAULT_SETTINGS.calendarHeight;
        const rightSidebarWidth = isFiniteNumber(parsed?.rightSidebarWidth)
            ? clampInt(parsed.rightSidebarWidth, RIGHT_SIDEBAR_WIDTH_MIN, RIGHT_SIDEBAR_WIDTH_MAX)
            : DEFAULT_SETTINGS.rightSidebarWidth;

        const tb = parsed?.timeBlockSettings ?? {};
        const timeBlockSettings: TimeBlockSettings = {
            minLogDuration: isFiniteNumber(tb?.minLogDuration)
                ? Math.max(1, Math.floor(tb.minLogDuration))
                : DEFAULT_SETTINGS.timeBlockSettings.minLogDuration,
            maxAttachDistance: isFiniteNumber(tb?.maxAttachDistance)
                ? Math.max(0, Math.floor(tb.maxAttachDistance))
                : DEFAULT_SETTINGS.timeBlockSettings.maxAttachDistance,
            lookaheadWindow: isFiniteNumber(tb?.lookaheadWindow)
                ? Math.max(0, Math.floor(tb.lookaheadWindow))
                : DEFAULT_SETTINGS.timeBlockSettings.lookaheadWindow,
            minDuration: isFiniteNumber(tb?.minDuration)
                ? Math.max(1, Math.floor(tb.minDuration))
                : DEFAULT_SETTINGS.timeBlockSettings.minDuration,
        };

        const uiMinAppDuration = isFiniteNumber(parsed?.uiMinAppDuration)
            ? Math.max(1, Math.floor(parsed.uiMinAppDuration))
            : DEFAULT_SETTINGS.uiMinAppDuration;

        const categorySidebarCount = isFiniteNumber(parsed?.categorySidebarCount)
            ? clampInt(parsed.categorySidebarCount, 1, 30)
            : DEFAULT_SETTINGS.categorySidebarCount;

        let fieldLocks = normalizeFieldLocks(parsed?.fieldLocks);
        if (parsed?.settingsLocked === true && parsed?.fieldLocks == null) {
            fieldLocks = { ...DEFAULT_FIELD_LOCKS };
            (Object.keys(DEFAULT_FIELD_LOCKS) as SettingsFieldKey[]).forEach((k) => {
                fieldLocks[k] = true;
            });
        }

        return {
            calendarStartHour,
            calendarHeight,
            rightSidebarWidth,
            timeBlockSettings,
            uiMinAppDuration,
            categorySidebarCount,
            fieldLocks,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function persistSettings(settings: PersistedSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error(
            "[settingsStore] Failed to persist settings to localStorage (quota or access denied):",
            e
        );
    }
}

const initial = loadStoredSettings();

function persistedSlice(state: SettingsState): PersistedSettings {
    return {
        calendarStartHour: state.calendarStartHour,
        calendarHeight: state.calendarHeight,
        rightSidebarWidth: state.rightSidebarWidth,
        timeBlockSettings: state.timeBlockSettings,
        uiMinAppDuration: state.uiMinAppDuration,
        categorySidebarCount: state.categorySidebarCount,
        fieldLocks: state.fieldLocks,
    };
}

export const useSettingsStore = create<SettingsState>((set, get) => {
    const setAndPersist = (next: PersistedSettings) => {
        persistSettings(next);
        set(next);
    };

    return {
        ...initial,
        setCalendarStartHour: (hour) => {
            const cur = get();
            if (cur.fieldLocks.calendarStartHour) return;
            const calendarStartHour = isFiniteNumber(hour) ? clampInt(hour, 0, 23) : DEFAULT_SETTINGS.calendarStartHour;
            setAndPersist({ ...persistedSlice(cur), calendarStartHour });
        },
        setCalendarHeight: (height) => {
            const cur = get();
            if (cur.fieldLocks.calendarHeight) return;
            const calendarHeight = isFiniteNumber(height)
                ? clampInt(height, CALENDAR_HEIGHT_MIN, CALENDAR_HEIGHT_MAX)
                : DEFAULT_SETTINGS.calendarHeight;
            setAndPersist({ ...persistedSlice(cur), calendarHeight });
        },
        setRightSidebarWidth: (width) => {
            const cur = get();
            if (cur.fieldLocks.rightSidebarWidth) return;
            const rightSidebarWidth = isFiniteNumber(width)
                ? clampInt(width, RIGHT_SIDEBAR_WIDTH_MIN, RIGHT_SIDEBAR_WIDTH_MAX)
                : DEFAULT_SETTINGS.rightSidebarWidth;
            setAndPersist({ ...persistedSlice(cur), rightSidebarWidth });
        },
        setTimeBlockSettings: (patch) => {
            const cur = get();
            const L = cur.fieldLocks;
            const tbCur = cur.timeBlockSettings;
            const tbPatch = patch ?? {};

            const timeBlockSettings: TimeBlockSettings = {
                minLogDuration: L.minLogDuration
                    ? tbCur.minLogDuration
                    : isFiniteNumber(tbPatch.minLogDuration)
                      ? Math.max(1, Math.floor(tbPatch.minLogDuration))
                      : tbCur.minLogDuration,
                maxAttachDistance: L.maxAttachDistance
                    ? tbCur.maxAttachDistance
                    : isFiniteNumber(tbPatch.maxAttachDistance)
                      ? Math.max(0, Math.floor(tbPatch.maxAttachDistance))
                      : tbCur.maxAttachDistance,
                lookaheadWindow: L.lookaheadWindow
                    ? tbCur.lookaheadWindow
                    : isFiniteNumber(tbPatch.lookaheadWindow)
                      ? Math.max(0, Math.floor(tbPatch.lookaheadWindow))
                      : tbCur.lookaheadWindow,
                minDuration: L.minDuration
                    ? tbCur.minDuration
                    : isFiniteNumber(tbPatch.minDuration)
                      ? Math.max(1, Math.floor(tbPatch.minDuration))
                      : tbCur.minDuration,
            };

            if (
                timeBlockSettings.minLogDuration === tbCur.minLogDuration &&
                timeBlockSettings.maxAttachDistance === tbCur.maxAttachDistance &&
                timeBlockSettings.lookaheadWindow === tbCur.lookaheadWindow &&
                timeBlockSettings.minDuration === tbCur.minDuration
            ) {
                return;
            }

            setAndPersist({ ...persistedSlice(cur), timeBlockSettings });
        },
        setUiMinAppDuration: (seconds) => {
            const cur = get();
            if (cur.fieldLocks.uiMinAppDuration) return;
            const uiMinAppDuration = isFiniteNumber(seconds) ? Math.max(1, Math.floor(seconds)) : DEFAULT_SETTINGS.uiMinAppDuration;
            setAndPersist({ ...persistedSlice(cur), uiMinAppDuration });
        },
        setCategorySidebarCount: (count) => {
            const cur = get();
            if (cur.fieldLocks.categorySidebarCount) return;
            const categorySidebarCount = isFiniteNumber(count)
                ? clampInt(count, 1, 30)
                : DEFAULT_SETTINGS.categorySidebarCount;
            setAndPersist({ ...persistedSlice(cur), categorySidebarCount });
        },
        toggleFieldLock: (key) => {
            const cur = get();
            const fieldLocks = { ...cur.fieldLocks, [key]: !cur.fieldLocks[key] };
            setAndPersist({ ...persistedSlice(cur), fieldLocks });
        },
        resetField: (key) => {
            const cur = get();
            if (cur.fieldLocks[key]) return;
            const base = persistedSlice(cur);
            if (key === "calendarStartHour") {
                setAndPersist({ ...base, calendarStartHour: DEFAULT_SETTINGS.calendarStartHour });
                return;
            }
            if (key === "calendarHeight") {
                setAndPersist({ ...base, calendarHeight: DEFAULT_SETTINGS.calendarHeight });
                return;
            }
            if (key === "rightSidebarWidth") {
                setAndPersist({ ...base, rightSidebarWidth: DEFAULT_SETTINGS.rightSidebarWidth });
                return;
            }
            if (key === "categorySidebarCount") {
                setAndPersist({ ...base, categorySidebarCount: DEFAULT_SETTINGS.categorySidebarCount });
                return;
            }
            if (key === "uiMinAppDuration") {
                setAndPersist({ ...base, uiMinAppDuration: DEFAULT_SETTINGS.uiMinAppDuration });
                return;
            }
            if (
                key === "minLogDuration" ||
                key === "maxAttachDistance" ||
                key === "lookaheadWindow" ||
                key === "minDuration"
            ) {
                setAndPersist({
                    ...base,
                    timeBlockSettings: {
                        ...cur.timeBlockSettings,
                        [key]: DEFAULT_SETTINGS.timeBlockSettings[key],
                    },
                });
            }
        },
        resetSettings: () => {
            const cur = get();
            const L = cur.fieldLocks;
            const d = DEFAULT_SETTINGS.timeBlockSettings;
            const tb = cur.timeBlockSettings;
            setAndPersist({
                calendarStartHour: L.calendarStartHour ? cur.calendarStartHour : DEFAULT_SETTINGS.calendarStartHour,
                calendarHeight: L.calendarHeight ? cur.calendarHeight : DEFAULT_SETTINGS.calendarHeight,
                rightSidebarWidth: L.rightSidebarWidth ? cur.rightSidebarWidth : DEFAULT_SETTINGS.rightSidebarWidth,
                categorySidebarCount: L.categorySidebarCount
                    ? cur.categorySidebarCount
                    : DEFAULT_SETTINGS.categorySidebarCount,
                uiMinAppDuration: L.uiMinAppDuration ? cur.uiMinAppDuration : DEFAULT_SETTINGS.uiMinAppDuration,
                timeBlockSettings: {
                    minLogDuration: L.minLogDuration ? tb.minLogDuration : d.minLogDuration,
                    maxAttachDistance: L.maxAttachDistance ? tb.maxAttachDistance : d.maxAttachDistance,
                    lookaheadWindow: L.lookaheadWindow ? tb.lookaheadWindow : d.lookaheadWindow,
                    minDuration: L.minDuration ? tb.minDuration : d.minDuration,
                },
                fieldLocks: cur.fieldLocks,
            });
        },
    };
});
