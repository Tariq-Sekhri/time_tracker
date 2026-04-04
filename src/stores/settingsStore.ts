import { create } from "zustand";

export type TimeBlockSettings = {
    minLogDuration: number;
    maxAttachDistance: number;
    lookaheadWindow: number;
    minDuration: number;
};

export type SettingsState = {
    calendarStartHour: number;
    rightSidebarWidth: number;
    timeBlockSettings: TimeBlockSettings;
    uiMinAppDuration: number;
    categorySidebarCount: number;
    setCalendarStartHour: (hour: number) => void;
    setRightSidebarWidth: (width: number) => void;
    setTimeBlockSettings: (patch: Partial<TimeBlockSettings>) => void;
    setUiMinAppDuration: (seconds: number) => void;
    setCategorySidebarCount: (count: number) => void;
    resetSettings: () => void;
};

const STORAGE_KEY = "time-tracker:settings";

const DEFAULT_SETTINGS: Omit<SettingsState, "setCalendarStartHour" | "setRightSidebarWidth" | "setTimeBlockSettings" | "setUiMinAppDuration" | "setCategorySidebarCount" | "resetSettings"> = {
    calendarStartHour: 6,
    rightSidebarWidth: 480,
    timeBlockSettings: {
        minLogDuration: 60,
        maxAttachDistance: 600,
        lookaheadWindow: 600,
        minDuration: 60,
    },
    uiMinAppDuration: 60,
    categorySidebarCount: 5,
};

function isFiniteNumber(n: unknown): n is number {
    return typeof n === "number" && Number.isFinite(n);
}

function clampInt(value: number, min: number, max: number): number {
    const v = Math.floor(value);
    return Math.min(max, Math.max(min, v));
}

function loadStoredSettings(): Omit<
    SettingsState,
    "setCalendarStartHour" | "setRightSidebarWidth" | "setTimeBlockSettings" | "setUiMinAppDuration" | "setCategorySidebarCount" | "resetSettings"
> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as any;

        const calendarStartHour = isFiniteNumber(parsed?.calendarStartHour)
            ? clampInt(parsed.calendarStartHour, 0, 23)
            : DEFAULT_SETTINGS.calendarStartHour;
        const rightSidebarWidth = isFiniteNumber(parsed?.rightSidebarWidth)
            ? clampInt(parsed.rightSidebarWidth, 280, 800)
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

        return {
            calendarStartHour,
            rightSidebarWidth,
            timeBlockSettings,
            uiMinAppDuration,
            categorySidebarCount,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function persistSettings(settings: Omit<
    SettingsState,
    "setCalendarStartHour" | "setRightSidebarWidth" | "setTimeBlockSettings" | "setUiMinAppDuration" | "setCategorySidebarCount" | "resetSettings"
>): void {
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

export const useSettingsStore = create<SettingsState>((set, get) => {
    const setAndPersist = (
        next: Omit<
            SettingsState,
            "setCalendarStartHour" | "setRightSidebarWidth" | "setTimeBlockSettings" | "setUiMinAppDuration" | "setCategorySidebarCount" | "resetSettings"
        >
    ) => {
        persistSettings(next);
        set(next);
    };

    return {
        ...initial,
        setCalendarStartHour: (hour) => {
            const calendarStartHour = isFiniteNumber(hour) ? clampInt(hour, 0, 23) : DEFAULT_SETTINGS.calendarStartHour;
            const cur = get();
            setAndPersist({
                calendarStartHour,
                rightSidebarWidth: cur.rightSidebarWidth,
                timeBlockSettings: cur.timeBlockSettings,
                uiMinAppDuration: cur.uiMinAppDuration,
                categorySidebarCount: cur.categorySidebarCount,
            });
        },
        setRightSidebarWidth: (width) => {
            const rightSidebarWidth = isFiniteNumber(width) ? clampInt(width, 280, 800) : DEFAULT_SETTINGS.rightSidebarWidth;
            const cur = get();
            setAndPersist({
                calendarStartHour: cur.calendarStartHour,
                rightSidebarWidth,
                timeBlockSettings: cur.timeBlockSettings,
                uiMinAppDuration: cur.uiMinAppDuration,
                categorySidebarCount: cur.categorySidebarCount,
            });
        },
        setTimeBlockSettings: (patch) => {
            const cur = get();
            const tbCur = cur.timeBlockSettings;
            const tbPatch = patch ?? {};

            const timeBlockSettings: TimeBlockSettings = {
                minLogDuration: isFiniteNumber(tbPatch.minLogDuration)
                    ? Math.max(1, Math.floor(tbPatch.minLogDuration))
                    : tbCur.minLogDuration,
                maxAttachDistance: isFiniteNumber(tbPatch.maxAttachDistance)
                    ? Math.max(0, Math.floor(tbPatch.maxAttachDistance))
                    : tbCur.maxAttachDistance,
                lookaheadWindow: isFiniteNumber(tbPatch.lookaheadWindow)
                    ? Math.max(0, Math.floor(tbPatch.lookaheadWindow))
                    : tbCur.lookaheadWindow,
                minDuration: isFiniteNumber(tbPatch.minDuration)
                    ? Math.max(1, Math.floor(tbPatch.minDuration))
                    : tbCur.minDuration,
            };

            setAndPersist({ ...cur, timeBlockSettings });
        },
        setUiMinAppDuration: (seconds) => {
            const uiMinAppDuration = isFiniteNumber(seconds) ? Math.max(1, Math.floor(seconds)) : DEFAULT_SETTINGS.uiMinAppDuration;
            const cur = get();
            setAndPersist({
                calendarStartHour: cur.calendarStartHour,
                rightSidebarWidth: cur.rightSidebarWidth,
                timeBlockSettings: cur.timeBlockSettings,
                uiMinAppDuration,
                categorySidebarCount: cur.categorySidebarCount,
            });
        },
        setCategorySidebarCount: (count) => {
            const categorySidebarCount = isFiniteNumber(count)
                ? clampInt(count, 1, 30)
                : DEFAULT_SETTINGS.categorySidebarCount;
            const cur = get();
            setAndPersist({
                calendarStartHour: cur.calendarStartHour,
                rightSidebarWidth: cur.rightSidebarWidth,
                timeBlockSettings: cur.timeBlockSettings,
                uiMinAppDuration: cur.uiMinAppDuration,
                categorySidebarCount,
            });
        },
        resetSettings: () => {
            persistSettings(DEFAULT_SETTINGS);
            set(DEFAULT_SETTINGS);
        },
    };
});

