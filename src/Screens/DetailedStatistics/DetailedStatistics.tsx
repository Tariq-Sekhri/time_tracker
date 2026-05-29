/**
 * =============================================================================
 * DetailedStatistics.tsx — FULL WALKTHROUGH
 * =============================================================================
 *
 * WHAT THIS SCREEN IS:
 *   A full-page analytics view reachable from elsewhere in the app (parent passes
 *   onBack to pop/navigate back). It shows how you spent time across categories,
 *   apps, hours of day, and (on Trend tab) week-over-week category changes.
 *
 * THREE TABS (activeTab state):
 *   1. dailyAvg — "per active day" averages over the selected date range
 *   2. total    — raw sums over the selected date range + lifetime header cards
 *   3. trend    — multi-week chart; separate date range; NO right sidebar
 *
 * DATA FLOW SUMMARY:
 *   boundsStats  ← get_total_statistics     (once: first day, all-time total)
 *   rangeStats   ← get_week_statistics      (Daily Avg + Total: one call for whole range)
 *   dailyAvgStats← client transform of rangeStats (divide by active days)
 *   trendWeekStats← N × get_week_statistics (one per week in trend range)
 *   categoryAppLogs← get_logs_by_category   (only when user clicks a category)
 *
 * LAYOUT:
 *   flex row: [ main scrollable column ] [ optional 384px sidebar ]
 * =============================================================================
 */

import {useQueries, useQuery} from "@tanstack/react-query";
import {useEffect, useMemo, useRef, useState} from "react";
// WeekStatistics is the shape returned for a time range (categories, apps, hourly, etc.)
import {get_total_statistics, get_week_statistics, WeekStatistics} from "../../api/statistics.ts";
// MergedLog = one log segment; get_logs_by_category returns many for sidebar drill-down
import {get_logs_by_category, MergedLog} from "../../api/Log.ts";
// Global settings: min duration to show apps, calendar day boundary hour, etc.
import {useSettingsStore} from "../../stores/settingsStore.ts";
// Context menu to recategorize apps from sidebar; categorizeLayers = portal UI to render
import {useAppCategorizeMenu} from "../../hooks/useAppCategorizeMenu.tsx";
// Click app row → filter main calendar to that app (shared with calendar screen)
import {logRowLeftClickCalendarFilter} from "../../utils/calendarAppFilterRowClick.ts";
// Which app name is currently highlighted as "calendar filter active"
import {useCalendarAppFilterActive} from "../../stores/calendarAppFilterStore.ts";
// Date range UI control; calendarDateFromUnix converts backend unix → Date for picker
import StatisticsDateRangePicker, {calendarDateFromUnix} from "./StatisticsDateRangePicker.tsx";
// Trend tab chart component (this file passes it weeks + fetched stats)
import CategoryWeekTrendChart from "./CategoryWeekTrendChart.tsx";
// Checkbox dropdown to show/hide category lines on trend chart
import CategoryVisibilityFilter from "../../Componants/CategoryVisibilityFilter.tsx";
import {get_categories} from "../../api/Category.ts";
import {useVisibleCategoryFilter} from "../../hooks/useVisibleCategoryFilter.ts";
import {
    adjustInstantToCalendarDayBoundary, // snap "now" to which calendar day we're in
    enumerateWeekRangesInSpan,          // trend range → [{week_start, week_end}, ...]
    getCalendarDayRangeUnix,            // Date + startHour → {day_start, day_end} unix
} from "../../utils.ts";

type Tab = "dailyAvg" | "total" | "trend";

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
 * @param onBack — callback when user clicks "← Back" (parent handles navigation)
 */
export default function DetailedStatistics({onBack}: { onBack: () => void }) {
    // Which of the three tabs is selected; default Daily Avg
    const [activeTab, setActiveTab] = useState<Tab>("dailyAvg");
    // How category/sidebar rows show values: % or duration (type includes "count" but UI only has % and Time)
    const [displayMode, setDisplayMode] = useState<"percentage" | "time" | "count">("time");
    // null = sidebar shows "Top Apps"; string = category name → fetch apps in that category
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Hook: right-click app → categorize dialog; invalidates stats when categorization changes
    const {openFromContextMenu, categorizeLayers} = useAppCategorizeMenu({
        // After recategorize, refetch these query keys so bars/percentages update
        extraInvalidateQueryKeys: [["total_statistics"], ["range_statistics"]],
    });
    // App name currently linked to calendar filter (for blue ring highlight in sidebar)
    const calendarAppFilterActive = useCalendarAppFilterActive();

    // Hide apps below this duration in sidebar lists (UI preference, not DB filter for range stats)
    const uiMinAppDuration = useSettingsStore((state) => state.uiMinAppDuration);
    // Minimum log length when fetching category_app_logs from API
    const minLogDuration = useSettingsStore((state) => state.timeBlockSettings.minLogDuration);
    // Hour (0–23) when "calendar day" starts — affects date picker max, unix ranges, hourly chart order
    const calendarStartHour = useSettingsStore((state) => state.calendarStartHour);

    // DOM node for right sidebar — used in click-outside handler
    const sidebarRef = useRef<HTMLDivElement | null>(null);
    // DOM node for category list — clicks here should NOT clear selectedCategory
    const categoriesRef = useRef<HTMLDivElement | null>(null);

    // --- QUERY: lifetime bounds (first active day, all-time total) ---
    const {data: boundsStats, isLoading: isBoundsLoading} = useQuery({
        queryKey: ["total_statistics"],       // cache key; must match invalidate keys elsewhere
        queryFn: get_total_statistics,        // Tauri/backend call
        staleTime: Infinity,                  // never auto-refetch; manual invalidate only
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    // --- QUERY: all categories (names, colors, priority) for trend filter + consistency ---
    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    // Hook encapsulates visible/hidden category checkboxes for Trend chart
    const {
        visibleCategoryIds,       // Set or array of ids — which categories to plot
        visibleCategoryNames,     // names passed to CategoryWeekTrendChart
        categoriesByPriority,     // sorted for filter dropdown order
        isCategoryFilterOpen,     // dropdown open state
        setIsCategoryFilterOpen,
        categoryFilterRef,        // anchor for click-outside on filter button
        categoryFilterPanelRef,   // panel element ref
        toggleVisibleCategory,    // toggle one checkbox
        checkAllCategories,
        uncheckAllCategories,
    } = useVisibleCategoryFilter(categories);

    // Latest selectable end date = "today" per calendar rules (not always midnight)
    const maxSelectableDate = useMemo(
        () => adjustInstantToCalendarDayBoundary(new Date(), calendarStartHour),
        [calendarStartHour] // recompute if user changes when their day starts
    );

    // Earliest selectable start = first day we have any tracking data
    const minSelectableDate = useMemo(() => {
        if (!boundsStats?.first_active_day) return null; // still loading or no data ever
        return calendarDateFromUnix(boundsStats.first_active_day);
    }, [boundsStats?.first_active_day]);

    // --- DATE STATE: shared by Daily Avg + Total tabs ---
    const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null); // null until initialized
    const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);

    // --- DATE STATE: Trend tab only ---
    // EFFECT: first time minSelectableDate is known, set range to [first day … today]
    useEffect(() => {
        if (!minSelectableDate || rangeStartDate || rangeEndDate) return; // wait or already set
        setRangeStartDate(minSelectableDate);
        setRangeEndDate(maxSelectableDate);
    }, [minSelectableDate, maxSelectableDate, rangeStartDate, rangeEndDate]);

    //

    //
    //
    // MEMO: list of week objects for trend chart x-axis and per-week API calls
    const trendWeeks = useMemo(() => {
        if (!rangeStartDate || !rangeEndDate) return []; // not ready yet
        return enumerateWeekRangesInSpan(rangeStartDate, rangeEndDate, calendarStartHour);
    }, [rangeStartDate, rangeEndDate, calendarStartHour]);

    // PARALLEL QUERIES: one get_week_statistics per week in trend range
    const trendWeekQueries = useQueries({
        queries: trendWeeks.map((w) => ({
            queryKey: ["week_statistics", w.week_start, w.week_end, calendarStartHour],
            queryFn: () => get_week_statistics(w.week_start, w.week_end),
            enabled: activeTab === "trend", // don't fetch weeks while user is on Daily Avg/Total
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        })),
    });

    // Extract just the data objects from each query result (undefined while loading)
    const trendWeekStats = trendWeekQueries.map((q) => q.data);
    // True if we have weeks to load AND any week query is still loading/fetching
    const isTrendLoading =
        trendWeekQueries.length > 0 && trendWeekQueries.some((q) => q.isLoading || q.isFetching);

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
        enabled: !!rangeUnix, // only run when we have valid unix bounds
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    // MEMO: build "daily average" view by dividing every duration field by active day count
    const dailyAvgStats: WeekStatistics | null = useMemo(() => {
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
    }, [rangeStats]);

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
    const {data: categoryAppLogs = [], isLoading: isLoadingCategory} = useQuery({
        queryKey: categoryQueryKey,
        enabled: !!selectedCategory, // no fetch until user picks a category row
        queryFn: async () => {
            if (!selectedCategory) return [];
            const result: MergedLog[] = await get_logs_by_category({
                category: selectedCategory,
                start_time: categoryStartTime,
                end_time: categoryEndTime,
                min_log_duration: minLogDuration,
            });
            // Same app can appear in many log rows — aggregate to one row per app name
            const logMap = new Map<string, { app: string; totalDuration: number }>();
            result.forEach((log) => {
                const existing = logMap.get(log.app);
                if (existing) {
                    existing.totalDuration += log.duration;
                } else {
                    logMap.set(log.app, {app: log.app, totalDuration: log.duration});
                }
            });
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

    // Is current range picker already at full-history default? (disables Reset button)


    // Helper: category logs are always raw totals from API; scale only on Daily Avg tab
    const scaledDuration = (seconds: number) => {
        if (activeTab !== "dailyAvg") return Math.floor(seconds);
        if (numberOfActiveDays <= 0) return 0;
        return Math.floor(seconds / numberOfActiveDays);
    };

    const scaledCategoryAppList = useMemo(
        () =>
            categoryAppLogs
                .map((a) => ({
                    ...a,
                    totalDuration: scaledDuration(a.totalDuration),
                }))
                .sort((a, b) => b.totalDuration - a.totalDuration),
        [categoryAppLogs, activeTab, numberOfActiveDays]
    );

    const selectedCategoryTotalDuration = selectedCategoryStat?.total_duration ?? 0;
    type DisplayApp = { app: string; totalDuration: number };

    const filteredScaledCategoryAppList = useMemo(
        () => scaledCategoryAppList.filter((a) => a.totalDuration >= uiMinAppDuration),
        [scaledCategoryAppList, uiMinAppDuration]
    );

    const sidebarApps: DisplayApp[] = useMemo(
        () =>
            selectedCategory
                ? filteredScaledCategoryAppList
                : (stats?.all_apps ?? [])
                    .filter((app) => app.total_duration >= uiMinAppDuration)
                    .map((app) => ({
                        app: app.app,
                        totalDuration: app.total_duration,
                    })),
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
    const hourlyByClockHour = useMemo(() => {
        const map = new Map<number, number>();
        for (const h of stats?.hourly_distribution ?? []) {
            if (h.hour >= 0 && h.hour <= 23) {
                map.set(h.hour, (map.get(h.hour) ?? 0) + h.total_duration);
            }
        }
        return map;
    }, [stats?.hourly_distribution]);

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

    // --- MAIN RENDER (stats is non-null for dailyAvg/total; trend has dates set) ---
    return (
        <div className="flex h-full overflow-hidden">
            {/* LEFT: main content column */}
            <div
                className={`flex-1 min-w-0 p-6 text-white h-full min-h-0 ${
                    activeTab === "trend" ? "flex flex-col overflow-hidden" : "overflow-y-auto nice-scrollbar"
                }`}
            >
                {/* Header row: Back | Title | spacer for centering */}
                <div
                    className={`flex items-center justify-between ${activeTab === "trend" ? "mb-4 shrink-0" : "mb-6"}`}>
                    <button
                        onClick={onBack}
                        className="text-gray-400 hover:text-white"
                    >
                        ← Back
                    </button>
                    <h1 className="text-2xl font-bold">Detailed Statistics</h1>
                    <div className="w-20"></div>
                </div>

                {/* Tab buttons + date range picker row */}
                <div
                    className={`flex flex-wrap items-center justify-between gap-3 ${activeTab === "trend" ? "mb-4 shrink-0" : "mb-6"}`}>
                    <div className="flex gap-1 bg-gray-800 rounded-lg p-1 shrink-0">
                        <button
                            onClick={() => setActiveTab("dailyAvg")}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "dailyAvg" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                        >
                            Daily Avg
                        </button>
                        <button
                            onClick={() => setActiveTab("total")}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "total" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                        >
                            Total
                        </button>
                        <button
                            onClick={() => setActiveTab("trend")}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "trend" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                        >
                            Trend
                        </button>
                    </div>
                    {minSelectableDate &&
                    ((rangeStartDate && rangeEndDate)) ? (
                        <div className="ml-auto shrink-0 flex items-center gap-2">
                            <button

                                type="button"
                                onClick={() => {
                                    setRangeStartDate(minSelectableDate);
                                    setRangeEndDate(maxSelectableDate);
                                }}
                                disabled={!(rangeStartDate != minSelectableDate || rangeEndDate != maxSelectableDate)}
                                className="px-2.5 py-1.5 text-sm text-white-400 hover:text-gray-500 bg-gray-800/80 border border-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
                            >
                                Reset
                            </button>
                            <StatisticsDateRangePicker
                                startDate={rangeStartDate}
                                endDate={rangeEndDate}
                                minDate={minSelectableDate}
                                maxDate={maxSelectableDate}
                                onRangeChange={(start, end) => {
                                    setRangeStartDate(start);
                                    setRangeEndDate(end);
                                }}
                            />
                        </div>
                    ) : (
                        <div className="text-sm text-gray-500 ml-auto">No tracking data yet</div>
                    )}
                </div>

                {/* TREND TAB ONLY: chart fills remaining height; no category list / hourly / sidebar */}
                {activeTab === "trend" && (
                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
                            <h2 className="text-xl font-bold">Category trends</h2>
                            {/* Which category lines appear on the multi-week stacked/line chart */}
                            <CategoryVisibilityFilter
                                categories={categories}
                                categoriesByPriority={categoriesByPriority}
                                visibleCategoryIds={visibleCategoryIds}
                                isOpen={isCategoryFilterOpen}
                                onOpenChange={setIsCategoryFilterOpen}
                                filterRef={categoryFilterRef}
                                panelRef={categoryFilterPanelRef}
                                onToggle={toggleVisibleCategory}
                                onCheckAll={checkAllCategories}
                                onUncheckAll={uncheckAllCategories}
                            />
                        </div>
                        {/* weeks = x-axis labels; weekStats[i] matches trendWeekQueries[i].data */}
                        <CategoryWeekTrendChart
                            weeks={trendWeeks}
                            weekStats={trendWeekStats}
                            isLoading={isTrendLoading}
                            visibleCategoryNames={visibleCategoryNames}
                            calendarStartHour={calendarStartHour}
                        />
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
                )}

                {/* HOURLY CHART: Daily Avg only; uses stats.hourly_distribution (already per-active-day scaled) */}
                {activeTab === "dailyAvg" && (
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
                )}
            </div>

            {/* RIGHT SIDEBAR: 384px; hidden entirely on Trend tab */}
            {activeTab !== "trend" && stats && (
                <div ref={sidebarRef}
                     className="w-96 border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col">
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

                    <div className="space-y-2 flex-1">
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
                            sidebarAppsFiltered.map((app) => {
                                // Blue bar width: relative to longest app in list (visual ranking)
                                const barPct = (app.totalDuration / sidebarMaxDuration) * 100;
                                // Text %: share of category total (if drilled in) or whole-range total (Top Apps)
                                const pct = sidebarPercentDenom > 0 ? (app.totalDuration / sidebarPercentDenom) * 100 : 0;
                                return (
                                    <div
                                        key={app.app}
                                        data-tt-app-context
                                        onClick={(e) => logRowLeftClickCalendarFilter(e, app.app)}
                                        onContextMenu={(e) => openFromContextMenu(e, app.app)}
                                        className={`rounded px-2 py-1 cursor-pointer select-text ${calendarAppFilterActive === app.app
                                            ? "bg-gray-800 ring-1 ring-blue-500 ring-inset"
                                            : "hover:bg-gray-900/80"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1 gap-3">
                                            <span className="text-sm text-gray-200 truncate flex-1">{app.app}</span>
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
                            })
                        )}
                    </div>
                </div>
            )}
            {/* Portal/modal layers from useAppCategorizeMenu — must render at root of this screen */}
            {categorizeLayers}
        </div>
    );
}
