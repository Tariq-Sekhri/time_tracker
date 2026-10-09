import {useCallback, useEffect, useState} from "react";
import {getAppMetadata, setAppMetadata} from "../api/appMetadata.ts";

const KEY = "time-tracker:manual-project-filters";
type Filters = Record<string, {inCal?: boolean; inStats?: boolean}>;
export type ManualProjectFilter = (projectId?: number | null) => boolean;

export function useManualProjectFilters(defaultInCal: boolean, defaultInStats: boolean) {
    const [filters, setFilters] = useState<Filters>({});
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        getAppMetadata(KEY).then((raw) => {
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setFilters(parsed);
        }).catch(() => {}).finally(() => setLoaded(true));
    }, []);
    useEffect(() => {
        if (loaded) setAppMetadata(KEY, JSON.stringify(filters)).catch(() => {});
    }, [filters, loaded]);
    const isManualTimeInCal = useCallback<ManualProjectFilter>(
        (id) => filters[String(id ?? "none")]?.inCal ?? defaultInCal, [filters, defaultInCal]);
    const isManualTimeInStats = useCallback<ManualProjectFilter>(
        (id) => filters[String(id ?? "none")]?.inStats ?? defaultInStats, [filters, defaultInStats]);
    const toggle = useCallback((id: number | null, field: "inCal" | "inStats", fallback: boolean) => {
        const key = String(id ?? "none");
        setFilters((current) => ({...current, [key]: {...current[key], [field]: !(current[key]?.[field] ?? fallback)}}));
    }, []);
    return {
        isManualTimeInCal, isManualTimeInStats,
        toggleManualTimeInCal: (id: number | null) => toggle(id, "inCal", defaultInCal),
        toggleManualTimeInStats: (id: number | null) => toggle(id, "inStats", defaultInStats),
        manualProjectFiltersLoaded: loaded,
    };
}
