import {useCallback, useEffect, useState} from "react";
import {getAppMetadata, setAppMetadata} from "../api/appMetadata.ts";

const KEY = "time-tracker:manual-project-filters";
type Filters = Record<string, {inCal?: boolean; inStats?: boolean}>;
export type ManualProjectFilter = (projectId?: number | null) => boolean;

export function useManualProjectFilters(defaultInCal: boolean, defaultInStats: boolean) {
    const [filters, setFilters] = useState<Filters>({});
    const [isolatedProject, setIsolatedProject] = useState<{id: number | null} | null>(null);
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
        (id) => isolatedProject ? (id ?? null) === isolatedProject.id : filters[String(id ?? "none")]?.inCal ?? filters.all?.inCal ?? defaultInCal, [filters, defaultInCal, isolatedProject]);
    const isManualTimeInStats = useCallback<ManualProjectFilter>(
        (id) => filters[String(id ?? "none")]?.inStats ?? filters.all?.inStats ?? defaultInStats, [filters, defaultInStats]);
    const toggle = useCallback((id: number | null, field: "inCal" | "inStats", fallback: boolean) => {
        const key = String(id ?? "none");
        setFilters((current) => ({...current, [key]: {...current[key], [field]: !(current[key]?.[field] ?? current.all?.[field] ?? fallback)}}));
    }, []);
    const toggleAll = (ids: (number | null)[], field: "inCal" | "inStats") => {
        const predicate = field === "inCal" ? isManualTimeInCal : isManualTimeInStats;
        const next = !ids.every(predicate);
        if (field === "inCal") setIsolatedProject(null);
        setFilters((current) => {
            const updated = {...current};
            for (const key of new Set(["all", ...Object.keys(current), ...ids.map((id) => String(id ?? "none"))])) {
                updated[key] = {...current[key], [field]: next};
            }
            return updated;
        });
    };
    return {
        isManualTimeInCal, isManualTimeInStats,
        toggleManualTimeInCal: (id: number | null) => {setIsolatedProject(null); toggle(id, "inCal", defaultInCal);},
        toggleManualTimeInStats: (id: number | null) => toggle(id, "inStats", defaultInStats),
        isolatedProject,
        toggleIsolateProject: (id: number | null) => setIsolatedProject((current) => current?.id === id ? null : {id}),
        toggleAllManualTimeInCal: (ids: (number | null)[]) => toggleAll(ids, "inCal"),
        toggleAllManualTimeInStats: (ids: (number | null)[]) => toggleAll(ids, "inStats"),
        manualProjectFiltersLoaded: loaded,
    };
}
