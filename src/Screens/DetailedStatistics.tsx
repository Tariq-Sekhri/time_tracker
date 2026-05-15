import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { get_total_statistics, get_week_statistics, WeekStatistics } from "../api/statistics.ts";
import { get_logs_by_category, MergedLog } from "../api/Log.ts";
import { useSettingsStore } from "../stores/settingsStore.ts";
import { useAppCategorizeMenu } from "../hooks/useAppCategorizeMenu.tsx";
import { logRowLeftClickCalendarFilter } from "../utils/calendarAppFilterRowClick.ts";
import { useCalendarAppFilterActive } from "../stores/calendarAppFilterStore.ts";
import StatisticsDateRangePicker, { calendarDateFromUnix } from "../components/StatisticsDateRangePicker.tsx";
import CategoryWeekTrendChart from "../components/CategoryWeekTrendChart.tsx";
import CategoryVisibilityFilter from "../Componants/CategoryVisibilityFilter.tsx";
import { get_categories } from "../api/Category.ts";
import { useVisibleCategoryFilter } from "../hooks/useVisibleCategoryFilter.ts";
import {
    adjustInstantToCalendarDayBoundary,
    enumerateWeekRangesInSpan,
    getCalendarDayRangeUnix,
    getWeekStartDate,
} from "../utils.ts";

type Tab = "dailyAvg" | "total" | "trend";

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});
}

function formatCalendarSpanSinceFirstActiveDay(firstActiveDayUnix: number): string {
    const start = new Date(firstActiveDayUnix * 1000);
    const end = new Date();
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    if (days < 0) {
        months -= 1;
        days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    const parts: string[] = [];
    if (years > 0) {
        parts.push(`${years} year${years === 1 ? "" : "s"}`);
    }
    if (months > 0) {
        parts.push(`${months} month${months === 1 ? "" : "s"}`);
    }
    if (days > 0 || parts.length === 0) {
        parts.push(`${days} day${days === 1 ? "" : "s"}`);
    }
    return parts.join(" ");
}

export default function DetailedStatistics({ onBack }: { onBack: () => void }) {
    const [activeTab, setActiveTab] = useState<Tab>("dailyAvg");
    const [displayMode, setDisplayMode] = useState<"percentage" | "time" | "count">("time");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const { openFromContextMenu, categorizeLayers } = useAppCategorizeMenu({
        extraInvalidateQueryKeys: [["total_statistics"], ["range_statistics"]],
    });
    const calendarAppFilterActive = useCalendarAppFilterActive();

    const uiMinAppDuration = useSettingsStore((state) => state.uiMinAppDuration);
    const minLogDuration = useSettingsStore((state) => state.timeBlockSettings.minLogDuration);
    const calendarStartHour = useSettingsStore((state) => state.calendarStartHour);

    const sidebarRef = useRef<HTMLDivElement | null>(null);
    const categoriesRef = useRef<HTMLDivElement | null>(null);

    const { data: boundsStats, isLoading: isBoundsLoading } = useQuery({
        queryKey: ["total_statistics"],
        queryFn: get_total_statistics,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const {
        visibleCategoryIds,
        visibleCategoryNames,
        categoriesByPriority,
        isCategoryFilterOpen,
        setIsCategoryFilterOpen,
        categoryFilterRef,
        categoryFilterPanelRef,
        toggleVisibleCategory,
        checkAllCategories,
        uncheckAllCategories,
    } = useVisibleCategoryFilter(categories);

    const maxSelectableDate = useMemo(
        () => adjustInstantToCalendarDayBoundary(new Date(), calendarStartHour),
        [calendarStartHour]
    );

    const minSelectableDate = useMemo(() => {
        if (!boundsStats?.first_active_day) return null;
        return calendarDateFromUnix(boundsStats.first_active_day);
    }, [boundsStats?.first_active_day]);

    const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null);
    const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
    const [trendStartDate, setTrendStartDate] = useState<Date | null>(null);
    const [trendEndDate, setTrendEndDate] = useState<Date | null>(null);

    useEffect(() => {
        if (!minSelectableDate || rangeStartDate || rangeEndDate) return;
        setRangeStartDate(minSelectableDate);
        setRangeEndDate(maxSelectableDate);
    }, [minSelectableDate, maxSelectableDate, rangeStartDate, rangeEndDate]);

    useEffect(() => {
        if (!minSelectableDate || trendStartDate || trendEndDate) return;
        const end = maxSelectableDate;
        const start = new Date(end);
        start.setDate(start.getDate() - 7 * 11);
        const clampedStart =
            start.getTime() < minSelectableDate.getTime() ? minSelectableDate : start;
        setTrendStartDate(getWeekStartDate(clampedStart, calendarStartHour));
        setTrendEndDate(end);
    }, [minSelectableDate, maxSelectableDate, calendarStartHour, trendStartDate, trendEndDate]);

    const trendWeeks = useMemo(() => {
        if (!trendStartDate || !trendEndDate) return [];
        return enumerateWeekRangesInSpan(trendStartDate, trendEndDate, calendarStartHour);
    }, [trendStartDate, trendEndDate, calendarStartHour]);

    const trendWeekQueries = useQueries({
        queries: trendWeeks.map((w) => ({
            queryKey: ["week_statistics", w.week_start, w.week_end, calendarStartHour],
            queryFn: () => get_week_statistics(w.week_start, w.week_end),
            enabled: activeTab === "trend",
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        })),
    });

    const trendWeekStats = trendWeekQueries.map((q) => q.data);
    const isTrendLoading =
        trendWeekQueries.length > 0 && trendWeekQueries.some((q) => q.isLoading || q.isFetching);

    const rangeUnix = useMemo(() => {
        if (!rangeStartDate || !rangeEndDate) return null;
        const { day_start } = getCalendarDayRangeUnix(rangeStartDate, calendarStartHour);
        const { day_end } = getCalendarDayRangeUnix(rangeEndDate, calendarStartHour);
        return { start: day_start, end: day_end };
    }, [rangeStartDate, rangeEndDate, calendarStartHour]);

    const { data: rangeStats, isLoading: isRangeLoading } = useQuery({
        queryKey: ["range_statistics", rangeUnix?.start, rangeUnix?.end, calendarStartHour],
        queryFn: () => get_week_statistics(rangeUnix!.start, rangeUnix!.end),
        enabled: !!rangeUnix,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const dailyAvgStats: WeekStatistics | null = useMemo(() => {
        if (!rangeStats) return null;
        return {
            ...rangeStats,
            total_time: rangeStats.number_of_active_days > 0
                ? Math.floor(rangeStats.total_time / rangeStats.number_of_active_days)
                : 0,
            categories: rangeStats.categories.map(cat => ({
                ...cat,
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
                    total_duration: 0,
                })),
        };
    }, [rangeStats]);

    const stats: WeekStatistics | null =
        activeTab === "dailyAvg" ? dailyAvgStats : activeTab === "total" ? (rangeStats ?? null) : null;

    const categoryStartTime = rangeUnix?.start ?? 0;
    const categoryEndTime = rangeUnix?.end ?? Math.floor(Date.now() / 1000);
    const categoryQueryKey = selectedCategory
        ? ["category_app_logs", selectedCategory, categoryStartTime, categoryEndTime, minLogDuration]
        : ["category_app_logs", "none"];
    const { data: categoryAppLogs = [], isLoading: isLoadingCategory } = useQuery({
        queryKey: categoryQueryKey,
        enabled: !!selectedCategory,
        queryFn: async () => {
            if (!selectedCategory) return [];
            const result: MergedLog[] = await get_logs_by_category({
                category: selectedCategory,
                start_time: categoryStartTime,
                end_time: categoryEndTime,
                min_log_duration: minLogDuration,
            });
            const logMap = new Map<string, { app: string; totalDuration: number }>();
            result.forEach((log) => {
                const existing = logMap.get(log.app);
                if (existing) {
                    existing.totalDuration += log.duration;
                } else {
                    logMap.set(log.app, { app: log.app, totalDuration: log.duration });
                }
            });
            return Array.from(logMap.values()).sort((a, b) => b.totalDuration - a.totalDuration);
        },
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    useEffect(() => {
        if (!selectedCategory) return;

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

    const selectedCategoryStat = selectedCategory
        ? stats?.categories.find((c) => c.category === selectedCategory)
        : null;

    const numberOfActiveDays = rangeStats?.number_of_active_days ?? 0;
    const isStatsLoading = isBoundsLoading || isRangeLoading || !rangeStartDate || !rangeEndDate;
    const isDefaultDateRange = useMemo(() => {
        if (!minSelectableDate || !rangeStartDate || !rangeEndDate) return true;
        return (
            rangeStartDate.getTime() === minSelectableDate.getTime() &&
            rangeEndDate.getTime() === maxSelectableDate.getTime()
        );
    }, [minSelectableDate, maxSelectableDate, rangeStartDate, rangeEndDate]);

    const defaultTrendStartDate = useMemo(() => {
        if (!minSelectableDate) return null;
        const end = maxSelectableDate;
        const start = new Date(end);
        start.setDate(start.getDate() - 7 * 11);
        return getWeekStartDate(
            start.getTime() < minSelectableDate.getTime() ? minSelectableDate : start,
            calendarStartHour
        );
    }, [minSelectableDate, maxSelectableDate, calendarStartHour]);

    const isDefaultTrendRange = useMemo(() => {
        if (!defaultTrendStartDate || !trendStartDate || !trendEndDate) return true;
        return (
            trendStartDate.getTime() === defaultTrendStartDate.getTime() &&
            trendEndDate.getTime() === maxSelectableDate.getTime()
        );
    }, [defaultTrendStartDate, maxSelectableDate, trendStartDate, trendEndDate]);

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

    const sidebarAppsFiltered = sidebarApps;
    const sidebarMaxDuration = Math.max(...sidebarAppsFiltered.map((a) => a.totalDuration), 1);
    const sidebarPercentDenom = selectedCategory
        ? selectedCategoryTotalDuration
        : (stats?.total_time ?? 0);
    const hourlyByClockHour = useMemo(() => {
        const map = new Map<number, number>();
        for (const h of stats?.hourly_distribution ?? []) {
            if (h.hour >= 0 && h.hour <= 23) {
                map.set(h.hour, (map.get(h.hour) ?? 0) + h.total_duration);
            }
        }
        return map;
    }, [stats?.hourly_distribution]);

    const hourlyPoints = useMemo(() => {
        const start = Math.min(23, Math.max(0, Math.floor(calendarStartHour)));
        return Array.from({ length: 25 }, (_, slot) => {
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
    const hourlyLinePath = useMemo(
        () =>
            hourlyPoints
                .map((h, idx) => {
                    const x = (h.slot / 24) * 700 + 50;
                    const y = 190 - ((h.total_duration / 60) / maxHourlyMinutes) * 160;
                    return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                })
                .join(" "),
        [hourlyPoints, maxHourlyMinutes]
    );
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

    if (activeTab === "trend") {
        if (isBoundsLoading || !trendStartDate || !trendEndDate) {
            return (
                <div className="p-6">
                    <div className="text-gray-500">Loading {tabLoadingLabel} statistics...</div>
                </div>
            );
        }
    } else if (!stats) {
        return (
            <div className="p-6">
                <div className="text-gray-500">
                    {isStatsLoading ? `Loading ${tabLoadingLabel} statistics...` : "No statistics available"}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full overflow-hidden">
            <div
                className={`flex-1 min-w-0 p-6 text-white h-full min-h-0 ${
                    activeTab === "trend" ? "flex flex-col overflow-hidden" : "overflow-y-auto nice-scrollbar"
                }`}
            >
                <div className={`flex items-center justify-between ${activeTab === "trend" ? "mb-4 shrink-0" : "mb-6"}`}>
                    <button
                        onClick={onBack}
                        className="text-gray-400 hover:text-white"
                    >
                        ← Back
                    </button>
                    <h1 className="text-2xl font-bold">Detailed Statistics</h1>
                    <div className="w-20"></div>
                </div>

                <div className={`flex flex-wrap items-center justify-between gap-3 ${activeTab === "trend" ? "mb-4 shrink-0" : "mb-6"}`}>
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
                    ((activeTab === "trend" && trendStartDate && trendEndDate) ||
                        (activeTab !== "trend" && rangeStartDate && rangeEndDate)) ? (
                        <div className="ml-auto shrink-0 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (activeTab === "trend") {
                                        if (!defaultTrendStartDate) return;
                                        setTrendStartDate(defaultTrendStartDate);
                                        setTrendEndDate(maxSelectableDate);
                                    } else {
                                        setRangeStartDate(minSelectableDate);
                                        setRangeEndDate(maxSelectableDate);
                                    }
                                }}
                                disabled={activeTab === "trend" ? isDefaultTrendRange : isDefaultDateRange}
                                className="px-2.5 py-1.5 text-sm text-gray-400 hover:text-white bg-gray-800/80 border border-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
                            >
                                Reset
                            </button>
                            <StatisticsDateRangePicker
                                startDate={activeTab === "trend" ? trendStartDate! : rangeStartDate!}
                                endDate={activeTab === "trend" ? trendEndDate! : rangeEndDate!}
                                minDate={minSelectableDate}
                                maxDate={maxSelectableDate}
                                onRangeChange={(start, end) => {
                                    if (activeTab === "trend") {
                                        setTrendStartDate(start);
                                        setTrendEndDate(end);
                                    } else {
                                        setRangeStartDate(start);
                                        setRangeEndDate(end);
                                    }
                                }}
                            />
                        </div>
                    ) : (
                        <div className="text-sm text-gray-500 ml-auto">No tracking data yet</div>
                    )}
                </div>

                {activeTab === "trend" && (
                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
                            <h2 className="text-xl font-bold">Category trends</h2>
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
                        <CategoryWeekTrendChart
                            weeks={trendWeeks}
                            weekStats={trendWeekStats}
                            isLoading={isTrendLoading}
                            visibleCategoryNames={visibleCategoryNames}
                            calendarStartHour={calendarStartHour}
                        />
                    </div>
                )}

                {activeTab === "total" && boundsStats && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Total Time</div>
                            <div className="text-lg font-semibold">{formatDuration(boundsStats.total_time_all_time)}</div>
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

                {activeTab === "dailyAvg" && (
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Avg Time (Active Days)</div>
                            <div className="text-lg font-semibold">{formatDuration(Math.floor(rangeStats!.average_time_active_days))}</div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Most Active Day</div>
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

                {activeTab !== "trend" && stats && (
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">Categories</h2>
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

                {activeTab === "dailyAvg" && (
                    <div className="mb-6">
                        <h2 className="text-xl font-bold mb-4">Hourly Activity Distribution</h2>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="relative h-48">
                                <svg width="100%" height="100%" viewBox="0 0 800 200" className="overflow-visible">
                                    <defs>
                                        <linearGradient id="hourlyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor="#f97316" stopOpacity="0.8"/>
                                            <stop offset="100%" stopColor="#f97316" stopOpacity="0.2"/>
                                        </linearGradient>
                                    </defs>
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
                                    <path
                                        d={hourlyLinePath}
                                        fill="none"
                                        stroke="#f97316"
                                        strokeWidth="2"
                                    />
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

            {activeTab !== "trend" && stats && (
            <div ref={sidebarRef} className="w-96 border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col">
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
                                        const barPct = (app.totalDuration / sidebarMaxDuration) * 100;
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
                                        <div className="h-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, barPct))}%` }} />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            )}
            {categorizeLayers}
        </div>
    );
}
