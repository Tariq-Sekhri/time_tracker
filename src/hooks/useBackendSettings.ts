import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flipSettingLock,
    getSettings,
    resetSettingVal,
    updateSettingVal,
} from "../api/settings.ts";

export type SettingField = {
    key: string;
    val: number;
    isLocked: boolean;
    defaultVal: number;
    min: number | null;
    max: number | null;
};

export type TimeBlockSettings = {
    minLogDuration: number;
    maxAttachDistance: number;
    lookaheadWindow: number;
    minDuration: number;
};

export type BackendSettings = {
    fields: Record<string, SettingField>;
    allLocked: boolean;
    calendarStartHour: number;
    calendarHeight: number;
    rightSidebarWidth: number;
    categorySidebarCount: number;
    uiMinAppDuration: number;
    timeBlockSettings: TimeBlockSettings;
    setVal: (key: string, val: number) => void;
    toggleLock: (key: string) => void;
    resetField: (key: string) => void;
    resetSettings: () => void;
};

const SETTINGS_QUERY_KEY = ["settings"];

const LOADING_FALLBACK: Record<string, number> = {
    calendarStartHour: 8,
    calendarHeight: 100,
    rightSidebarWidth: 480,
    categorySidebarCount: 5,
    uiMinAppDuration: 30,
    minLogDuration: 1,
    maxAttachDistance: 400,
    lookaheadWindow: 500,
    minDuration: 300,
};

export function useBackendSettings(): BackendSettings {
    const queryClient = useQueryClient();
    const { data } = useQuery({
        queryKey: SETTINGS_QUERY_KEY,
        queryFn: getSettings,
    });

    const fields = useMemo(() => {
        const map: Record<string, SettingField> = {};
        for (const row of data ?? []) {
            map[row.key] = {
                key: row.key,
                val: row.val,
                isLocked: row.is_locked,
                defaultVal: row.default_val,
                min: row.min_val,
                max: row.max_val,
            };
        }
        return map;
    }, [data]);

    const allLocked = useMemo(() => {
        const list = Object.values(fields);
        return list.length > 0 && list.every((f) => f.isLocked);
    }, [fields]);

    const valueOf = (key: string) => fields[key]?.val ?? LOADING_FALLBACK[key];

    const timeBlockSettings = useMemo<TimeBlockSettings>(
        () => ({
            minLogDuration: fields.minLogDuration?.val ?? LOADING_FALLBACK.minLogDuration,
            maxAttachDistance: fields.maxAttachDistance?.val ?? LOADING_FALLBACK.maxAttachDistance,
            lookaheadWindow: fields.lookaheadWindow?.val ?? LOADING_FALLBACK.lookaheadWindow,
            minDuration: fields.minDuration?.val ?? LOADING_FALLBACK.minDuration,
        }),
        [fields]
    );

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    };

    const run = (fn: () => Promise<void>) => {
        fn().then(refresh).catch(() => {});
    };

    return {
        fields,
        allLocked,
        calendarStartHour: valueOf("calendarStartHour"),
        calendarHeight: valueOf("calendarHeight"),
        rightSidebarWidth: valueOf("rightSidebarWidth"),
        categorySidebarCount: valueOf("categorySidebarCount"),
        uiMinAppDuration: valueOf("uiMinAppDuration"),
        timeBlockSettings,
        setVal: (key, val) => {
            const field = fields[key];
            if (!field || field.isLocked || !Number.isFinite(val)) return;
            run(() => updateSettingVal(key, Math.floor(val)));
        },
        toggleLock: (key) => {
            run(() => flipSettingLock(key));
        },
        resetField: (key) => {
            if (fields[key]?.isLocked) return;
            run(() => resetSettingVal(key));
        },
        resetSettings: () => {
            const unlocked = Object.values(fields).filter((f) => !f.isLocked);
            run(async () => {
                await Promise.all(unlocked.map((f) => resetSettingVal(f.key)));
            });
        },
    };
}
