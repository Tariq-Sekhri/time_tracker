/**
 * Timing for heavy operations. Lines are prefixed "[perf]" and go through console.info,
 * which installDiagnostics() forwards into the support log next to the backend PERF lines.
 */
import {createElement, Profiler, useEffect, useRef, type ProfilerOnRenderCallback, type ReactNode} from "react";

export type PerfNotes = Record<string, string | number | boolean | null | undefined>;

/** Commands whose IPC round trip is logged by invokeLogged; the backend logs their stages. */
export const HEAVY_COMMANDS = new Set([
    "get_week",
    "get_week_for_app_filter",
    "get_week_statistics",
    "get_day_statistics",
    "get_total_statistics",
    "get_statistics_bounds",
    "get_trend_statistics",
    "get_logs",
    "get_logs_for_time_block",
    "get_logs_by_category",
    "get_logs_for_app_in_time_range",
    "count_logs_for_time_block",
    "delete_logs_for_time_block",
    "delete_logs_by_ids",
    "count_matching_logs",
    "insert_skipped_app_and_delete_logs",
    "get_manual_time_blocks",
    "get_google_calendar_events",
    "get_all_google_calendar_events",
    "list_available_google_calendars",
    "sync",
    "sync_now",
    "upload_all_logs",
    "reupload_all_logs",
    "device_logs",
    "get_devices",
    "create_manual_backup",
    "create_safety_backup",
    "restore_backup",
    "set_database_location",
    "reset_database_location",
]);

const fmt = (ms: number) => `${ms.toFixed(1)}ms`;

export function logPerf(name: string, stages: Record<string, number>, notes: PerfNotes = {}): void {
    const total = Object.values(stages).reduce((sum, ms) => sum + ms, 0);
    const parts = [
        `total=${fmt(total)}`,
        ...Object.entries(stages).map(([k, ms]) => `${k}=${fmt(ms)}`),
        ...Object.entries(notes).map(([k, v]) => `${k}=${v}`),
    ];
    console.info(`[perf] ${name} ${parts.join(" ")}`);
}

type PaintResult = {at: number; observed: boolean; reason?: string};

/** Hidden WebViews pause rAF. Exclude that wait from render timings and bound visible waits. */
export function observePaint(): Promise<PaintResult> {
    return new Promise((resolve) => {
        let firstFrame = 0;
        let secondFrame = 0;
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const finish = (observed: boolean, reason?: string) => {
            if (settled) return;
            settled = true;
            if (timeout !== undefined) clearTimeout(timeout);
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
            document.removeEventListener("visibilitychange", visibilityChanged);
            resolve({at: performance.now(), observed, reason});
        };
        const visibilityChanged = () => {
            if (document.visibilityState === "hidden") finish(false, "hidden");
        };
        if (document.visibilityState === "hidden") {
            finish(false, "hidden");
            return;
        }
        document.addEventListener("visibilitychange", visibilityChanged);
        timeout = setTimeout(() => finish(false, "timeout"), 1000);
        firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => finish(true));
        });
    });
}

/** Backwards-compatible timestamp helper for other screen timing probes. */
export async function afterPaint(): Promise<number> {
    return (await observePaint()).at;
}

type RenderSpan = {
    key: string;
    version: number;
    kind: "load" | "refresh";
    startedAt: number;
    dataAt: number | null;
    logged: boolean;
};

/**
 * Logs `<name>_load` from a `key` change (what the screen shows) to the first paint with
 * `ready` data, split into wait_data / react_commit / paint. When `version` changes after
 * that (e.g. a query's dataUpdatedAt on refetch), logs `<name>_refresh` for the re-render.
 * The span starts during render so the wait includes queries kicked off in effects.
 */
export function useRenderPerf(name: string, key: string, ready: boolean, version = 0, notes?: PerfNotes): void {
    const spanRef = useRef<RenderSpan | null>(null);
    const notesRef = useRef(notes);
    notesRef.current = notes;

    const now = performance.now();
    let span = spanRef.current;
    if (span?.key !== key) {
        span = spanRef.current = {key, version, kind: "load", startedAt: now, dataAt: null, logged: false};
    } else if (span.logged && span.version !== version) {
        span = spanRef.current = {key, version, kind: "refresh", startedAt: now, dataAt: now, logged: false};
    }
    if (ready && span.dataAt === null) {
        span.dataAt = now;
        span.version = version;
    }

    useEffect(() => {
        const current = spanRef.current;
        if (!current || current.logged || current.dataAt === null) return;
        current.logged = true;
        const dataAt = current.dataAt;
        const committedAt = performance.now();
        void observePaint().then((paint) => {
            logPerf(`${name}_${current.kind}`, {
                wait_data: dataAt - current.startedAt,
                react_commit: committedAt - dataAt,
                paint: paint.observed ? paint.at - committedAt : 0,
            }, {...notesRef.current, paint_observed: paint.observed, paint_skipped: paint.reason});
        });
    });
}

/** Time a synchronous computation (e.g. a useMemo body) and log it every time it runs. */
export function measure<T>(name: string, compute: () => T, notes?: (result: T) => PerfNotes): T {
    const started = performance.now();
    const result = compute();
    logPerf(`compute ${name}`, {run: performance.now() - started}, notes?.(result));
    return result;
}

/** React commits slower than this are logged by PerfProfiler. */
const PROFILER_MIN_MS = 1;

const onProfilerRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
    if (actualDuration < PROFILER_MIN_MS) return;
    logPerf(`react ${id}`, {actual: actualDuration}, {phase, base_ms: baseDuration.toFixed(1)});
};

/**
 * Logs React render cost for a subtree on every commit ≥ PROFILER_MIN_MS. `actual` is time
 * spent rendering this commit; `base_ms` is the estimated cost of re-rendering the whole
 * subtree without memoization. Only active in dev / profiling builds (no-op in production).
 */
export function PerfProfiler({id, children}: {id: string; children: ReactNode}) {
    return createElement(Profiler, {id, onRender: onProfilerRender}, children);
}

type BatchSpan = {
    key: string;
    startedAt: number;
    cachedAtStart: number;
    firstArrivalAt: number | null;
    allDoneAt: number | null;
    logged: boolean;
};

/**
 * Times a group of parallel queries (e.g. one stats call per trend week): from `key` change
 * to the first new result, to the last result, to paint. `done` = how many have data now.
 */
export function useBatchPerf(name: string, key: string, enabled: boolean, total: number, done: number, notes?: PerfNotes): void {
    const spanRef = useRef<BatchSpan | null>(null);
    const notesRef = useRef(notes);
    notesRef.current = notes;

    const now = performance.now();
    if (!enabled || total === 0) {
        spanRef.current = null;
    } else {
        if (spanRef.current?.key !== key) {
            spanRef.current = {key, startedAt: now, cachedAtStart: done, firstArrivalAt: null, allDoneAt: null, logged: false};
        }
        const span = spanRef.current;
        if (span.firstArrivalAt === null && done > span.cachedAtStart) span.firstArrivalAt = now;
        if (span.allDoneAt === null && done >= total) span.allDoneAt = now;
    }

    useEffect(() => {
        const span = spanRef.current;
        if (!span || span.logged || span.allDoneAt === null) return;
        span.logged = true;
        const allDoneAt = span.allDoneAt;
        const committedAt = performance.now();
        void observePaint().then((paint) => {
            logPerf(name, {
                to_first_result: (span.firstArrivalAt ?? allDoneAt) - span.startedAt,
                first_to_last: allDoneAt - (span.firstArrivalAt ?? allDoneAt),
                react_commit: committedAt - allDoneAt,
                paint: paint.observed ? paint.at - committedAt : 0,
            }, {queries: total, cached_at_start: span.cachedAtStart, fetched: total - span.cachedAtStart, ...notesRef.current, paint_observed: paint.observed, paint_skipped: paint.reason});
        });
    });
}

let longTaskObserverInstalled = false;
/** Log main-thread blocks ≥ 50ms (WebView2/Chromium "longtask" entries) — the UI is frozen for these. */
export function installLongTaskObserver(): void {
    if (longTaskObserverInstalled || typeof PerformanceObserver === "undefined") return;
    if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
    longTaskObserverInstalled = true;
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            logPerf("longtask", {blocked: entry.duration}, {at_ms: entry.startTime.toFixed(0)});
        }
    }).observe({type: "longtask", buffered: true});
}
