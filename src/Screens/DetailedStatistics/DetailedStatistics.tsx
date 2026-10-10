import AppTitleDetails from "../../Componants/AppTitleDetails.tsx";
import VirtualList from "../../Componants/VirtualList.tsx";
/**
 * =============================================================================
 * DetailedStatistics.tsx — FULL WALKTHROUGH
 * =============================================================================
 *
 * WHAT THIS SCREEN IS:
 *   A full-page analytics view reachable from the main navigation. It shows how you spent time across categories,
 *   apps, hours of day, and (on Trend tab) week-over-week category changes.
 *
 * THREE TABS (activeTab state):
 *   1. dailyAvg — "per active day" averages over the selected date range
 *   2. total    — raw sums over the selected date range + lifetime header cards
 *   3. trend    — multi-week chart; separate date range; NO right sidebar
 *
 * DATA FLOW SUMMARY:
 *   boundsStats: get_statistics_bounds (first day and all-time total)
 *   rangeStats   ← get_week_statistics      (Daily Avg + Total: one call for whole range)
 *   dailyAvgStats← client transform of rangeStats (divide by active days)
 *   trendWeekStats: get_trend_statistics (one batched range read)
 *   categoryAppLogs← get_logs_by_category   (only when user clicks a category)
 *
 * LAYOUT:
 *   flex row: [ main scrollable column ] [ optional 384px sidebar ]
 * =============================================================================
 */

import {useQuery} from "@tanstack/react-query";
import {reportError} from "../../diagnostics.ts";
import {useEffect, useMemo, useRef, useState} from "react";
import {measure, PerfProfiler, useBatchPerf, useRenderPerf} from "../../perf.ts";
// WeekStatistics is the shape returned for a time range (categories, apps, hourly, etc.)
import {get_statistics_bounds, get_trend_statistics, get_week_statistics, WeekStatistics, type TrendWeekStatistics} from "../../api/statistics.ts";
// MergedLog = one log segment; get_logs_by_category returns many for sidebar drill-down
import {get_logs_by_category, MergedLog} from "../../api/Log.ts";
// Global settings: min duration to show apps, calendar day boundary hour, etc.
// Context menu to recategorize apps from sidebar; categorizeLayers = portal UI to render
import {useAppCategorizeMenu} from "../../hooks/useAppCategorizeMenu.tsx";
import {useBackendSettings} from "../../hooks/useBackendSettings.ts";
// Click app row → filter main calendar to that app (shared with calendar screen)
import {logRowLeftClickCalendarFilter} from "../../utils/calendarAppFilterRowClick.ts";
// Which app name is currently highlighted as "calendar filter active"
import {useCalendarAppFilterActive} from "../../stores/calendarAppFilterStore.ts";
// Date range UI control; calendarDateFromUnix converts backend unix → Date for picker
import StatisticsDateRangePicker, {calendarDateFromUnix} from "./StatisticsDateRangePicker.tsx";
// Trend tab chart component (this file passes it weeks + fetched stats)
import CategoryWeekTrendChart, {type TrendSeriesMode, type TrendValueMode, type TrendAppRanking} from "./CategoryWeekTrendChart.tsx";
import TrendChartOptionsBar, {STATS_TOOLBAR_CONTROL_HEIGHT} from "./TrendChartOptionsBar.tsx";

const STATS_TOOLBAR_BUTTON = `${STATS_TOOLBAR_CONTROL_HEIGHT} px-3 bg-gray-800 border border-gray-700 rounded text-sm text-white gap-2`;
// Checkbox dropdown to show/hide category lines on trend chart
import FilterCategories, {useFilterCategories} from "../../Componants/FilterCategories.tsx";
import {getAppMetadata, setAppMetadata} from "../../api/appMetadata.ts";
import {get_manual_time_blocks, manualTimeAppStats, MANUAL_TIME_LABEL} from "../../api/ManualTimeBlock.ts";
import {getManualProjects, MANUAL_PROJECTS_QUERY_KEY} from "../../api/ManualProject.ts";
import {get_categories} from "../../api/Category.ts";
import {
    adjustInstantToCalendarDayBoundary, // snap "now" to which calendar day we're in
    enumerateWeekRangesInSpan,          // trend range → [{week_start, week_end}, ...]
    getCalendarDayRangeUnix,            // Date + startHour → {day_start, day_end} unix
} from "../../utils.ts";

export type StatisticsTab = "dailyAvg" | "total" | "trend";

const TREND_CHART_PREFS_KEY = "time-tracker:detailed-stats:trend-prefs";

type TrendChartPrefs = {
    valueMode: TrendValueMode;
    showTotalLine: boolean;
    seriesMode: TrendSeriesMode;
    topAppCount: number;
    appRanking: TrendAppRanking;
};

function parseTrendChartPrefs(raw: string | null): Partial<TrendChartPrefs> {
    if (!raw) return {};
    try {
        const o = JSON.parse(raw) as Record<string, unknown>;
        const out: Partial<TrendChartPrefs> = {};
        if (o.valueMode === "avg" || o.valueMode === "total") {
            out.valueMode = o.valueMode;
        }
        if (typeof o.showTotalLine === "boolean") {
            out.showTotalLine = o.showTotalLine;
        }
        if (o.seriesMode === "categories" || o.seriesMode === "topApps") {
            out.seriesMode = o.seriesMode;
        }
        if ([3, 4, 5, 6, 7, 8, 9].includes(Number(o.topAppCount))) {
            out.topAppCount = Number(o.topAppCount);
        }
        if (o.appRanking === "weekly" || o.appRanking === "range") {
            out.appRanking = o.appRanking;
        }
        return out;
    } catch (error) {
        void reportError("Parse trend chart preferences", error);
        return {};
    }
}

/**
 * formatDuration — turn seconds into "Xh Ym" or "Ym" for display labels.
 * @param seconds — raw duration from backend (integer seconds)
 */
function formatDuration(seconds: number): string {
    // Whole hours (3600 seconds per hour)
    const hours = Math.floor(seconds / 3600);
    // Remainder minutes after removing full hours
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        // Show both if we have partial hour (e.g. 2h 15m), else just hours (2h)
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    // Sub-hour only: minutes (0m possible if seconds < 60)
    return `${minutes}m`;
}

/**
 * formatDate — unix SECONDS → "May 29, 2026" style string for cards/labels.
 */
function formatDate(timestamp: number): string {
    // Backend uses unix seconds; JS Date wants milliseconds
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});
}

/**
 * formatCalendarSpanSinceFirstActiveDay — "2 years 3 months 5 days" since first log.
 * Uses calendar year/month/day math (not fixed 30-day months).
 */
function formatCalendarSpanSinceFirstActiveDay(firstActiveDayUnix: number): string {
    const start = new Date(firstActiveDayUnix * 1000); // first day user had any tracking
    const end = new Date();                             // right now
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    // Borrow from month if day diff went negative (e.g. May 5 → Apr 20)
    if (days < 0) {
        months -= 1;
        days += new Date(end.getFullYear(), end.getMonth(), 0).getDate(); // days in previous month
    }
    // Borrow from year if month diff went negative
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    const parts: string[] = []; // collect non-zero units
    if (years > 0) {
        parts.push(`${years} year${years === 1 ? "" : "s"}`);
    }
    if (months > 0) {
        parts.push(`${months} month${months === 1 ? "" : "s"}`);
    }
    // Always show at least days (even "0 days" if everything else is zero)
    if (days > 0 || parts.length === 0) {
        parts.push(`${days} day${days === 1 ? "" : "s"}`);
    }
    return parts.join(" "); // "2 years 3 months 5 days"
}

/**
 * DetailedStatistics — default export; main screen component.
 */
export default function DetailedStatistics({activeTab}: {
    activeTab: StatisticsTab;
}) {
    const [trendValueMode, setTrendValueMode] = useState<TrendValueMode>("total");
    const [trendShowTotalLine, setTrendShowTotalLine] = useState(true);
    const [trendSeriesMode, setTrendSeriesMode] = useState<TrendSeriesMode>("categories");
    const [trendTopAppCount, setTrendTopAppCount] = useState(5);
    const [trendAppRanking, setTrendAppRanking] = useState<TrendAppRanking>("weekly");
    const trendPrefsHydrated = useRef(false);
    // How category/sidebar rows show values: % or duration (type includes "count" but UI only has % and Time)
    const [displayMode, setDisplayMode] = useState<"percentage" | "time" | "count">("time");
    // null = sidebar shows "Top Apps"; string = category name → fetch apps in that category
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Hook: right-click app → categorize dialog; invalidates stats when categorization changes
    const {openFromContextMenuMany, categorizeLayers} = useAppCategorizeMenu({
        // After recategorize, refetch these query keys so bars/percentages update
        extraInvalidateQueryKeys: [["total_statistics"], ["range_statistics"]],
    });
    // App name currently linked to calendar filter (for blue ring highlight in sidebar)
    const calendarAppFilterActive = useCalendarAppFilterActive();

    // Hide apps below this duration in sidebar lists (UI preference, not DB filter for range stats)
    const { calendarStartHour, uiMinAppDuration, timeBlockSettings } = useBackendSettings();
    const minLogDuration = timeBlockSettings.minLogDuration;

    // DOM node for right sidebar — used in click-outside handler
    const sidebarRef = useRef<HTMLDivElement | null>(null);
    // DOM node for category list — clicks here should NOT clear selectedCategory
    const categoriesRef = useRef<HTMLDivElement | null>(null);

    // --- QUERY: lifetime bounds (first active day, all-time total) ---
    const {data: boundsStats, isLoading: isBoundsLoading} = useQuery({
        queryKey: ["total_statistics", "bounds"], // keep prefix invalidation, separate compact payload
        queryFn: get_statistics_bounds,        // Tauri/backend call
        staleTime: Infinity,                  // never auto-refetch; manual invalidate only
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
    const {
        visibleCategoryNames,
        categoriesByPriority,
        toggleVisibleCategory,
        checkAllCategories,
        uncheckAllCategories,
    } = useFilterCategories(categories, "regex_enabled");

    useEffect(() => {
        getAppMetadata(TREND_CHART_PREFS_KEY)
            .then((raw) => {
                const prefs = parseTrendChartPrefs(raw);
                if (prefs.valueMode) setTrendValueMode(prefs.valueMode);
                if (prefs.showTotalLine !== undefined) setTrendShowTotalLine(prefs.showTotalLine);
                if (prefs.seriesMode) setTrendSeriesMode(prefs.seriesMode);
                if (prefs.topAppCount) setTrendTopAppCount(prefs.topAppCount);
                if (prefs.appRanking) setTrendAppRanking(prefs.appRanking);
            })
            .catch(() => {})
            .finally(() => {
                trendPrefsHydrated.current = true;
            });
    }, []);

    useEffect(() => {
        if (!trendPrefsHydrated.current) return;
        const prefs: TrendChartPrefs = {
            valueMode: trendValueMode,
            showTotalLine: trendShowTotalLine,
            seriesMode: trendSeriesMode,
            topAppCount: trendTopAppCount,
            appRanking: trendAppRanking,
        };
        setAppMetadata(TREND_CHART_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
    }, [trendValueMode, trendShowTotalLine, trendSeriesMode, trendTopAppCount, trendAppRanking]);

    useEffect(() => {
        if (activeTab !== "trend" || trendSeriesMode !== "categories") {
            setIsCategoryFilterOpen(false);
        }
    }, [activeTab, trendSeriesMode]);

    const maxSelectableDate = useMemo(
        () => adjustInstantToCalendarDayBoundary(new Date(), calendarStartHour),
        [calendarStartHour] // recompute if user changes when their day starts
    );

    const minSelectableDate = useMemo(() => {
        if (!boundsStats?.first_active_day) return null; // still loading or no data ever
        return calendarDateFromUnix(boundsStats.first_active_day);
    }, [boundsStats?.first_active_day]);

    const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null);
    const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);

    useEffect(() => {
        if (!minSelectableDate || rangeStartDate || rangeEndDate) return; // wait or already set
        setRangeStartDate(minSelectableDate);
        setRangeEndDate(maxSelectableDate);
    }, [minSelectableDate, maxSelectableDate, rangeStartDate, rangeEndDate]);

    // MEMO: list of week objects for trend chart x-axis and per-week API calls
    const trendWeeks = useMemo(() => {
        if (!rangeStartDate || !rangeEndDate) return []; // not ready yet
        return enumerateWeekRangesInSpan(rangeStartDate, rangeEndDate, calendarStartHour);
    }, [rangeStartDate, rangeEndDate, calendarStartHour]);

    // One ordered, compact payload avoids N concurrent database scans and N partial chart renders.
    const {data: trendData, isLoading: isTrendQueryLoading, isFetching: isTrendFetching, error: trendError} = useQuery({
        queryKey: ["week_statistics", "trend", trendWeeks, calendarStartHour],
        queryFn: () => get_trend_statistics(trendWeeks),
        enabled: activeTab === "trend" && trendWeeks.length > 0,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const trendWeekStats: TrendWeekStatistics[] = useMemo(() => trendData ?? [], [trendData]);
    const isTrendLoading = trendWeeks.length > 0 && (isTrendQueryLoading || isTrendFetching);

    // MEMO: convert picker Dates → unix range for API (inclusive start/end of calendar days)
    const rangeUnix = useMemo(() => {
        if (!rangeStartDate || !rangeEndDate) return null;
        const {day_start} = getCalendarDayRangeUnix(rangeStartDate, calendarStartHour);
        const {day_end} = getCalendarDayRangeUnix(rangeEndDate, calendarStartHour);
        return {start: day_start, end: day_end};
    }, [rangeStartDate, rangeEndDate, calendarStartHour]);

    // QUERY: one big stats blob for entire selected range (powers Daily Avg + Total)
    const {data: rangeStats, isLoading: isRangeLoading} = useQuery({
        queryKey: ["range_statistics", rangeUnix?.start, rangeUnix?.end, calendarStartHour],
        queryFn: () => get_week_statistics(rangeUnix!.start, rangeUnix!.end), // same fn as weekly; wider span
        enabled: !!rangeUnix && activeTab !== "trend", // trend has its own compact payload
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    // MEMO: build "daily average" view by dividing every duration field by active day count
    const dailyAvgStats: WeekStatistics | null = useMemo(() => measure("detailed.dailyAvgStats", () => {
        if (!rangeStats) return null;
        return {
            ...rangeStats, // keep metadata fields unchanged (most_active_day, etc.)
            total_time: rangeStats.number_of_active_days > 0
                ? Math.floor(rangeStats.total_time / rangeStats.number_of_active_days)
                : 0,
            categories: rangeStats.categories.map(cat => ({
                ...cat, // percentage unchanged — still % of total in range
                total_duration: rangeStats.number_of_active_days > 0
                    ? Math.floor(cat.total_duration / rangeStats.number_of_active_days)
                    : 0,
            })),
            top_apps: rangeStats.top_apps.map(app => ({
                ...app,
                total_duration: rangeStats.number_of_active_days > 0
                    ? Math.floor(app.total_duration / rangeStats.number_of_active_days)
                    : 0,
            })),
            all_apps: rangeStats.all_apps.map(app => ({
                ...app,
                total_duration: rangeStats.number_of_active_days > 0
                    ? Math.floor(app.total_duration / rangeStats.number_of_active_days)
                    : 0,
            })),
            hourly_distribution: rangeStats.number_of_active_days > 0
                ? rangeStats.hourly_distribution.map(h => ({
                    ...h,
                    total_duration: Math.floor(h.total_duration / rangeStats.number_of_active_days),
                }))
                : rangeStats.hourly_distribution.map(h => ({
                    ...h,
                    total_duration: 0, // no active days → flat zero line
                })),
        };
    }, (r) => ({apps: r?.all_apps.length ?? 0, categories: r?.categories.length ?? 0})), [rangeStats]);

    // Pick which transformed stats object drives UI for non-trend tabs
    const stats: WeekStatistics | null =
        activeTab === "dailyAvg" ? dailyAvgStats : activeTab === "total" ? (rangeStats ?? null) : null;

    // Unix bounds for category log query (fallback end = now if range not ready)
    const categoryStartTime = rangeUnix?.start ?? 0;
    const categoryEndTime = rangeUnix?.end ?? Math.floor(Date.now() / 1000);
    // Query key includes category + range + min duration so cache invalidates correctly
    const categoryQueryKey = selectedCategory
        ? ["category_app_logs", selectedCategory, categoryStartTime, categoryEndTime, minLogDuration]
        : ["category_app_logs", "none"]; // placeholder key when nothing selected

    // QUERY: per-app totals within selected category (sidebar drill-down)
    const {data: manualProjects = []} = useQuery({queryKey: MANUAL_PROJECTS_QUERY_KEY, queryFn: getManualProjects});
    const trendVisibleCategoryNames = useMemo(
        () => new Set([...visibleCategoryNames, MANUAL_TIME_LABEL, ...manualProjects.map((project) => project.name)]),
        [visibleCategoryNames, manualProjects],
    );
    const {data: categoryAppLogs = [], isLoading: isLoadingCategory} = useQuery({
        queryKey: categoryQueryKey,
        enabled: !!selectedCategory, // no fetch until user picks a category row
        queryFn: async () => {
            if (!selectedCategory) return [];
            const blocks = await get_manual_time_blocks(categoryStartTime, categoryEndTime + 1);
            const manualRows = manualTimeAppStats(blocks.filter((block) => (block.project_name || MANUAL_TIME_LABEL) === selectedCategory), categoryStartTime, Math.min(categoryEndTime + 1, Math.floor(Date.now() / 1000) + 1));
            const result: MergedLog[] = await get_logs_by_category({
                category: selectedCategory,
                start_time: categoryStartTime,
                end_time: categoryEndTime,
                min_log_duration: minLogDuration,
            });
            // Same app can appear in many log rows — aggregate to one row per app name
            const logMap = new Map<string, { app: string; appNames: string[]; totalDuration: number }>();
            result.forEach((log) => {
                const existing = logMap.get(log.app);
                if (existing) {
                    existing.totalDuration += log.duration;
                    for (const appName of log.app_names) {
                        if (!existing.appNames.includes(appName)) existing.appNames.push(appName);
                    }
                } else {
                    logMap.set(log.app, {
                        app: log.app,
                        appNames: [...log.app_names],
                        totalDuration: log.duration,
                    });
                }
            });
            for (const row of manualRows) {
                const existing = logMap.get(row.app);
                if (existing) existing.totalDuration += row.total_duration;
                else logMap.set(row.app, {app: row.app, appNames: row.app_names, totalDuration: row.total_duration});
            }
            return Array.from(logMap.values()).sort((a, b) => b.totalDuration - a.totalDuration);
        },
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    // EFFECT: mousedown outside sidebar + category list → deselect category (show Top Apps again)
    useEffect(() => {
        if (!selectedCategory) return; // no listener needed

        const onDocumentMouseDown = (e: MouseEvent) => {
            const target = e.target as Node | null;
            if (!target) return;

            if (sidebarRef.current && sidebarRef.current.contains(target)) return;
            if (categoriesRef.current && categoriesRef.current.contains(target)) return;

            setSelectedCategory(null);
        };

        document.addEventListener("mousedown", onDocumentMouseDown);
        return () => {
            document.removeEventListener("mousedown", onDocumentMouseDown);
        };
    }, [selectedCategory]);

    // Row from stats.categories matching selected name (for color + total in sidebar %)
    const selectedCategoryStat = selectedCategory
        ? stats?.categories.find((c) => c.category === selectedCategory)
        : null;

    const numberOfActiveDays = rangeStats?.number_of_active_days ?? 0;
    // Loading gate for Daily Avg/Total before stats exists
    const isStatsLoading = isBoundsLoading || isRangeLoading || !rangeStartDate || !rangeEndDate;

    const isViewReady = activeTab === "trend"
        ? trendWeeks.length > 0 && !isTrendLoading
        : !isStatsLoading && !!rangeStats;
    // Renders since mount — a jump between two perf lines means a re-render storm.
    const renderCountRef = useRef(0);
    renderCountRef.current += 1;
    const trendWeeksDone = trendWeekStats.length;
    const perfNotes = {
        tab: activeTab,
        renders: renderCountRef.current,
        range_days: rangeUnix ? Math.round((rangeUnix.end - rangeUnix.start) / 86400) : 0,
        weeks: trendWeeks.length,
        weeks_loaded: trendWeeksDone,
        active_days: rangeStats?.number_of_active_days ?? 0,
        categories: rangeStats?.categories.length ?? 0,
        all_apps: rangeStats?.all_apps.length ?? 0,
        bounds_loading: isBoundsLoading,
        range_loading: isRangeLoading,
    };
    useBatchPerf(
        "detailed_stats_trend_batch",
        `${trendWeeks[0]?.week_start}|${trendWeeks[trendWeeks.length - 1]?.week_end}|${calendarStartHour}`,
        activeTab === "trend",
        trendWeeks.length,
        trendWeeksDone,
        {series_mode: trendSeriesMode, value_mode: trendValueMode},
    );
    // Screen open → first stats painted (includes compact lifetime bounds + range bootstrap).
    useRenderPerf("detailed_stats_open", "open", isViewReady, 0, perfNotes);
    // Each tab / range change → painted.
    useRenderPerf("detailed_stats_view", `${activeTab}|${rangeUnix?.start}|${rangeUnix?.end}`, isViewReady, 0, perfNotes);
    useRenderPerf(
        "detailed_stats_category",
        `${selectedCategory ?? ""}|${categoryStartTime}|${categoryEndTime}`,
        !!selectedCategory && !isLoadingCategory,
        0,
        {apps: categoryAppLogs.length},
    );

    // Is current range picker already at full-history default? (disables Reset button)


    // Helper: category logs are always raw totals from API; scale only on Daily Avg tab
    const scaledDuration = (seconds: number) => {
        if (activeTab !== "dailyAvg") return Math.floor(seconds);
        if (numberOfActiveDays <= 0) return 0;
        return Math.floor(seconds / numberOfActiveDays);
    };

    const scaledCategoryAppList = useMemo(
        () => measure("detailed.scaledCategoryApps", () =>
            categoryAppLogs
                .map((a) => ({
                    ...a,
                    totalDuration: scaledDuration(a.totalDuration),
                }))
                .sort((a, b) => b.totalDuration - a.totalDuration), (r) => ({apps: r.length})),
        [categoryAppLogs, activeTab, numberOfActiveDays]
    );

    const selectedCategoryTotalDuration = selectedCategoryStat?.total_duration ?? 0;
    type DisplayApp = { app: string; appNames: string[]; totalDuration: number };

    const filteredScaledCategoryAppList = useMemo(
        () => scaledCategoryAppList.filter((a) => a.totalDuration >= uiMinAppDuration),
        [scaledCategoryAppList, uiMinAppDuration]
    );

    const sidebarApps: DisplayApp[] = useMemo(
        () => measure("detailed.sidebarApps", () =>
            selectedCategory
                ? filteredScaledCategoryAppList
                : (stats?.all_apps ?? [])
                    .filter((app) => app.total_duration >= uiMinAppDuration)
                    .map((app) => ({
                        app: app.app,
                        appNames: app.app_names,
                        totalDuration: app.total_duration,
                    })), (r) => ({rows: r.length, source: selectedCategory ? "category" : "all_apps"})),
        [selectedCategory, filteredScaledCategoryAppList, stats?.all_apps, uiMinAppDuration]
    );

    // Alias — kept for readability in JSX; could inline sidebarApps
    const sidebarAppsFiltered = sidebarApps;
    // Longest bar = 100% width; avoid divide-by-zero with minimum 1
    const sidebarMaxDuration = Math.max(...sidebarAppsFiltered.map((a) => a.totalDuration), 1);
    // For % label: either fraction of selected category total or whole-range total
    const sidebarPercentDenom = selectedCategory
        ? selectedCategoryTotalDuration
        : (stats?.total_time ?? 0);

    // Map clock hour (0–23) → total seconds in that hour (from stats.hourly_distribution)
    const hourlyByClockHour = useMemo(() => measure("detailed.hourlyByClockHour", () => {
        const map = new Map<number, number>();
        for (const h of stats?.hourly_distribution ?? []) {
            if (h.hour >= 0 && h.hour <= 23) {
                map.set(h.hour, (map.get(h.hour) ?? 0) + h.total_duration);
            }
        }
        return map;
    }), [stats?.hourly_distribution]);

    // Build 25 points for chart: slots 0–23 = hours starting at calendarStartHour; slot 24 = wrap for fill
    const hourlyPoints = useMemo(() => {
        const start = Math.min(23, Math.max(0, Math.floor(calendarStartHour)));
        return Array.from({length: 25}, (_, slot) => {
            const clockHour = slot < 24 ? (start + slot) % 24 : start;
            return {
                slot,
                clockHour,
                total_duration: slot < 24 ? (hourlyByClockHour.get(clockHour) ?? 0) : 0,
            };
        });
    }, [hourlyByClockHour, calendarStartHour]);

    const maxHourlyMinutes = useMemo(
        () => Math.max(...hourlyPoints.map((h) => h.total_duration / 60), 1),
        [hourlyPoints]
    );

    // SVG polyline path commands (M = move, L = line) for orange line on hourly chart
    const hourlyLinePath = useMemo(
        () =>
            hourlyPoints
                .map((h, idx) => {
                    const x = (h.slot / 24) * 700 + 50;  // 50px left margin, 700px plot width
                    const y = 190 - ((h.total_duration / 60) / maxHourlyMinutes) * 160; // flip Y, scale to max
                    return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                })
                .join(" "),
        [hourlyPoints, maxHourlyMinutes]
    );
    // Closed path under line for gradient fill (Z = close path)
    const hourlyFillPath = useMemo(
        () =>
            `M 50 190 ${hourlyPoints
                .map((h) => {
                    const x = (h.slot / 24) * 700 + 50;
                    const y = 190 - ((h.total_duration / 60) / maxHourlyMinutes) * 160;
                    return `L ${x} ${y}`;
                })
                .join(" ")} L ${(24 / 24) * 700 + 50} 190 Z`,
        [hourlyPoints, maxHourlyMinutes]
    );

    const tabLoadingLabel =
        activeTab === "dailyAvg" ? "Daily Avg" : activeTab === "total" ? "Total" : "Trend";

    // --- LOADING / EMPTY STATES (early return before main layout) ---
    // Trend does not need `stats` (dailyAvgStats/rangeStats) — only bounds + trend dates + week queries

    if (activeTab === "trend") {
        if (isBoundsLoading || !rangeStartDate || !rangeEndDate) {
            return (
                <div className="p-6">
                    <div className="text-gray-500">Loading {tabLoadingLabel} statistics...</div>
                </div>
            );
        }
    } else if (!stats) {
        // Daily Avg / Total: `stats` is null while range query loading or if API returned nothing
        return (
            <div className="p-6">
                <div className="text-gray-500">
                    {isStatsLoading ? `Loading ${tabLoadingLabel} statistics...` : "No statistics available"}
                </div>
            </div>
        );
    }

    const trendToolbar =
        activeTab === "trend" ? (
            <>
                <TrendChartOptionsBar
                    valueMode={trendValueMode}
                    onValueModeChange={setTrendValueMode}
                    showTotalLine={trendShowTotalLine}
                    onShowTotalLineChange={setTrendShowTotalLine}
                    seriesMode={trendSeriesMode}
                    onSeriesModeChange={setTrendSeriesMode}
                    topAppCount={trendTopAppCount}
                    onTopAppCountChange={setTrendTopAppCount}
                    appRanking={trendAppRanking}
                    onAppRankingChange={setTrendAppRanking}
                />
                {trendSeriesMode === "categories" && (
                    <FilterCategories
                        enabledField="regex_enabled"
                        categories={categories}
                        categoriesByPriority={categoriesByPriority}
                        isOpen={isCategoryFilterOpen}
                        onOpenChange={setIsCategoryFilterOpen}
                        onToggle={toggleVisibleCategory}
                        onCheckAll={checkAllCategories}
                        onUncheckAll={uncheckAllCategories}
                        triggerClassName={`${STATS_TOOLBAR_BUTTON} hover:bg-gray-700`}
                    />
                )}
            </>
        ) : null;

    const hasDateRange = !!(minSelectableDate && rangeStartDate && rangeEndDate);

    // --- MAIN RENDER (stats is non-null for dailyAvg/total; trend has dates set) ---
    return (
        <PerfProfiler id="detailed.screen">
        <div className="flex h-full overflow-hidden">
            {/* LEFT: main content column */}
            <div
                className={`flex-1 min-w-0 text-white h-full min-h-0 ${
                    activeTab === "trend" ? "p-3 flex flex-col overflow-hidden" : "p-6 overflow-y-auto nice-scrollbar"
                }`}
            >
                {/* Chart options and date range picker row */}
                <div
                    className={`flex flex-wrap items-center gap-3 ${activeTab === "trend" ? "mb-2 shrink-0" : "mb-6"}`}>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2 shrink-0">
                        {trendToolbar}
                        {hasDateRange ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRangeStartDate(minSelectableDate!);
                                        setRangeEndDate(maxSelectableDate);
                                    }}
                                    disabled={
                                        !(
                                            rangeStartDate != minSelectableDate ||
                                            rangeEndDate != maxSelectableDate
                                        )
                                    }
                                    className={`${STATS_TOOLBAR_BUTTON} text-gray-300 hover:text-white hover:bg-gray-700/80 transition-colors disabled:opacity-40 disabled:pointer-events-none`}
                                >
                                    Reset
                                </button>
                                <PerfProfiler id="detailed.date_picker">
                                <StatisticsDateRangePicker
                                    startDate={rangeStartDate!}
                                    endDate={rangeEndDate!}
                                    minDate={minSelectableDate!}
                                    maxDate={maxSelectableDate}
                                    onRangeChange={(start, end) => {
                                        setRangeStartDate(start);
                                        setRangeEndDate(end);
                                    }}
                                />
                                </PerfProfiler>
                            </>
                        ) : (
                            <span className={`${STATS_TOOLBAR_CONTROL_HEIGHT} text-sm text-gray-500 px-1`}>
                                No tracking data yet
                            </span>
                        )}
                    </div>
                </div>

                {/* TREND TAB ONLY: chart fills remaining height; no category list / hourly / sidebar */}
                {activeTab === "trend" && (
                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                        <PerfProfiler id="detailed.trend_chart">
                        <CategoryWeekTrendChart
                            weeks={trendWeeks}
                            weekStats={trendWeekStats}
                            isLoading={isTrendLoading}
                            error={trendError ? "Could not load week trends. Change the date range or reopen Statistics to retry." : undefined}
                            visibleCategoryNames={trendVisibleCategoryNames}
                            seriesMode={trendSeriesMode}
                            topAppCount={trendTopAppCount}
                            appRanking={trendAppRanking}
                            calendarStartHour={calendarStartHour}
                            valueMode={trendValueMode}
                            showTotalLine={trendShowTotalLine}
                        />
                        </PerfProfiler>
                    </div>
                )}

                {/* TOTAL TAB: these two cards use boundsStats (ALL TIME), not rangeStats (selected range) */}
                {activeTab === "total" && boundsStats && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Total Time</div>
                            <div
                                className="text-lg font-semibold">{formatDuration(boundsStats.total_time_all_time)}</div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">First Active Day</div>
                            <div className="text-lg font-semibold">
                                {boundsStats.first_active_day
                                    ? `${formatDate(boundsStats.first_active_day)} (${formatCalendarSpanSinceFirstActiveDay(boundsStats.first_active_day)})`
                                    : "N/A"}
                            </div>
                        </div>
                    </div>
                )}

                {/* DAILY AVG TAB: summary cards read UN-SCALED rangeStats (API computes avg/best/worst day) */}
                {activeTab === "dailyAvg" && (
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Avg Time (Active Days)</div>
                            <div
                                className="text-lg font-semibold">{formatDuration(Math.floor(rangeStats!.average_time_active_days))}</div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Most Active Day</div>
                            {/* most_active_day = [unix_day_start, seconds_tracked_that_day] */}
                            <div className="text-lg font-semibold">
                                {rangeStats!.most_active_day ? formatDate(rangeStats!.most_active_day[0]) : "N/A"}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                                {rangeStats!.most_active_day ? `(${formatDuration(rangeStats!.most_active_day[1])})` : ""}
                            </div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Most Inactive Day</div>
                            <div className="text-lg font-semibold">
                                {rangeStats!.most_inactive_day ? formatDate(rangeStats!.most_inactive_day[0]) : "N/A"}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                                {rangeStats!.most_inactive_day ? `(${formatDuration(rangeStats!.most_inactive_day[1])})` : ""}
                            </div>
                        </div>
                    </div>
                )}

                {/* CATEGORY LIST: shown on Daily Avg + Total; click row toggles selectedCategory → sidebar drill-down */}
                {activeTab !== "trend" && stats && (
                    <PerfProfiler id="detailed.categories">
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Categories</h2>
                            {/* displayMode affects label text here AND in sidebar app rows */}
                            <div className="flex gap-1 bg-gray-800 rounded p-1">
                                <button
                                    onClick={() => setDisplayMode("percentage")}
                                    className={`px-2 py-1 text-xs rounded ${displayMode === "percentage" ? "bg-gray-700 text-white" : "text-gray-400"}`}
                                >
                                    %
                                </button>
                                <button
                                    onClick={() => setDisplayMode("time")}
                                    className={`px-2 py-1 text-xs rounded ${displayMode === "time" ? "bg-gray-700 text-white" : "text-gray-400"}`}
                                >
                                    Time
                                </button>
                            </div>
                        </div>
                        <div ref={categoriesRef} className="space-y-2">
                            {stats.categories.map((cat) => (
                                <div
                                    key={cat.category}
                                    className={`space-y-1 rounded p-2 cursor-pointer transition-colors focus:outline-none ${selectedCategory === cat.category ? "bg-gray-800" : "hover:bg-gray-800/50"}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        setSelectedCategory((prev) => (prev === cat.category ? null : cat.category));
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSelectedCategory((prev) => (prev === cat.category ? null : cat.category));
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{backgroundColor: cat.color || "#6b7280"}}
                                            />
                                            <span className="text-sm text-gray-200">{cat.category}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">
                                            {displayMode === "percentage"
                                                ? `${cat.percentage.toFixed(1)}%`
                                                : formatDuration(cat.total_duration)}
                                        </span>
                                        </div>
                                    </div>
                                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full"
                                            style={{
                                                width: `${cat.percentage}%`,
                                                backgroundColor: cat.color || "#6b7280",
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    </PerfProfiler>
                )}

                {/* HOURLY CHART: Daily Avg only; uses stats.hourly_distribution (already per-active-day scaled) */}
                {activeTab === "dailyAvg" && (
                    <PerfProfiler id="detailed.hourly_chart">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold mb-4">Hourly Activity Distribution</h2>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="relative h-48">
                                {/* viewBox 800×200: plot area x∈[50,750], y∈[10,190] (baseline y=190) */}
                                <svg width="100%" height="100%" viewBox="0 0 800 200" className="overflow-visible">
                                    <defs>
                                        {/* Orange fill under the curve */}
                                        <linearGradient id="hourlyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor="#f97316" stopOpacity="0.8"/>
                                            <stop offset="100%" stopColor="#f97316" stopOpacity="0.2"/>
                                        </linearGradient>
                                    </defs>
                                    {/* Vertical grid lines — one per hourly slot (0..24) */}
                                    {hourlyPoints.map((h) => (
                                        <line
                                            key={h.slot}
                                            x1={(h.slot / 24) * 700 + 50}
                                            y1="10"
                                            x2={(h.slot / 24) * 700 + 50}
                                            y2="190"
                                            stroke="#374151"
                                            strokeWidth="1"
                                            strokeDasharray="2,2"
                                        />
                                    ))}
                                    {/* Y-axis labels: 0h..4h relative to tallest bar (not absolute clock time) */}
                                    {[0, 1, 2, 3, 4].map(val => (
                                        <text
                                            key={val}
                                            x="45"
                                            y={190 - (val * 40)}
                                            fill="#9ca3af"
                                            fontSize="10"
                                            textAnchor="end"
                                        >
                                            {val}h
                                        </text>
                                    ))}
                                    {/* X-axis labels: actual clock hour (rotated) — order follows calendarStartHour */}
                                    {hourlyPoints.map((h) => {
                                        const x = (h.slot / 24) * 700 + 50;
                                        return (
                                            <text
                                                key={h.slot}
                                                x={x}
                                                y="200"
                                                fill="#9ca3af"
                                                fontSize="9"
                                                textAnchor="end"
                                                transform={`rotate(-45 ${x} 200)`}
                                            >
                                                {h.clockHour}:00
                                            </text>
                                        );
                                    })}
                                    {/* Stroke along top of filled area */}
                                    <path
                                        d={hourlyLinePath}
                                        fill="none"
                                        stroke="#f97316"
                                        strokeWidth="2"
                                    />
                                    {/* Filled area from baseline up to line */}
                                    <path
                                        d={hourlyFillPath}
                                        fill="url(#hourlyGradient)"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                    </PerfProfiler>
                )}
            </div>

            {/* RIGHT SIDEBAR: 384px; hidden entirely on Trend tab */}
            {activeTab !== "trend" && stats && (
                <PerfProfiler id="detailed.apps_sidebar">
                <div ref={sidebarRef}
                     className="w-96 min-h-0 border-l border-gray-700 bg-black p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{backgroundColor: selectedCategoryStat?.color || "#6b7280"}}
                            />
                            <h2 className="text-xl font-bold">
                                {selectedCategory ? `Apps in ${selectedCategory}` : "Top Apps"}
                            </h2>
                        </div>
                        {selectedCategory && (
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                Close
                            </button>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 flex flex-col">
                        {selectedCategory && isLoadingCategory ? (
                            <div className="text-gray-500 text-sm">Loading app contributions...</div>
                        ) : sidebarAppsFiltered.length === 0 ? (
                            selectedCategory ? (
                                <div className="text-gray-500 text-sm">
                                    No apps recorded for this category (at least {formatDuration(uiMinAppDuration)}).
                                </div>
                            ) : (
                                <div className="text-gray-500 text-sm">No apps recorded.</div>
                            )
                        ) : (
                            <VirtualList key={`${selectedCategory ?? "all"}:${activeTab}:${categoryStartTime}:${categoryEndTime}`}
                                items={sidebarAppsFiltered} itemKey={app => app.app} renderItem={(app) => {
                                // Blue bar width: relative to longest app in list (visual ranking)
                                const barPct = (app.totalDuration / sidebarMaxDuration) * 100;
                                // Text %: share of category total (if drilled in) or whole-range total (Top Apps)
                                const pct = sidebarPercentDenom > 0 ? (app.totalDuration / sidebarPercentDenom) * 100 : 0;
                                return (
                                    <div
                                        key={app.app}
                                        data-tt-app-context
                                        onClick={(e) => { if (app.appNames.length) logRowLeftClickCalendarFilter(e, app.app); }}
                                        onContextMenu={(e) => { if (app.appNames.length) openFromContextMenuMany(e, app.appNames); }}
                                        className={`rounded px-2 py-1 cursor-pointer select-text ${calendarAppFilterActive === app.app
                                            ? "bg-gray-800 ring-1 ring-blue-500 ring-inset"
                                            : "hover:bg-gray-900/80"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1 gap-3">
                                            <AppTitleDetails app={app.app} appNames={app.appNames}
                                                start={categoryStartTime} end={categoryEndTime}
                                                minDuration={selectedCategory ? minLogDuration : 1}
                                                className="text-sm text-gray-200 truncate flex-1" />
                                            <span className="text-sm text-gray-400 flex-shrink-0">
                                            {displayMode === "percentage" ? `${pct.toFixed(1)}%` : formatDuration(app.totalDuration)}
                                        </span>
                                        </div>
                                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-600"
                                                 style={{width: `${Math.max(0, Math.min(100, barPct))}%`}}/>
                                        </div>
                                    </div>
                                );
                            }} />
                        )}
                    </div>
                </div>
                </PerfProfiler>
            )}
            {/* Portal/modal layers from useAppCategorizeMenu — must render at root of this screen */}
            {categorizeLayers}
        </div>
        </PerfProfiler>
    );
}
