import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { get_week_statistics, CategoryStat } from "../../../api/statistics.ts";
import { getWeekRange } from "../../../utils.ts";
import { formatDuration, formatPercentage } from "../utils.ts";
import { DonutChart } from "../DonutChart.tsx";
import {
    get_all_google_calendar_events,
    googleEventDurationInRange,
    GoogleCalendar,
    GoogleCalendarEvent,
} from "../../../api/GoogleCalendar.ts";
import { useSettingsStore } from "../../../stores/settingsStore.ts";
import { toErrorString } from "../../../types/common.ts";
import { useToast } from "../../../Componants/Toast.tsx";
import { get_categories } from "../../../api/Category.ts";
import { get_cat_regex, insert_cat_regex, update_cat_regex_by_id } from "../../../api/CategoryRegex.ts";
import { count_matching_logs, insert_skipped_app_and_delete_logs } from "../../../api/SkippedApp.ts";

type DisplayMode = "percentage" | "time";

function percentageChangeVsPrevious(current: number, previous: number): number | null {
    if (previous > 0) {
        return ((current - previous) / previous) * 100;
    }
    if (current > 0) {
        return 100;
    }
    return null;
}

function inferPreviousTrackingTotal(current: number, pctChange: number | null): number | null {
    if (pctChange === null) {
        return current === 0 ? 0 : null;
    }
    if (pctChange === -100) {
        return null;
    }
    if (pctChange === 100) {
        return 0;
    }
    return current / (1 + pctChange / 100);
}

function exactAppRegexPattern(appName: string): string {
    const escaped = appName.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    return `^${escaped}$`;
}

type CombinedCategory = CategoryStat & {
    source: "tracking" | "google";
};

interface StatisticsSidebarProps {
    weekDate: Date;
    onMoreInfo: () => void;
    onAppsList?: () => void;
    onCategoryClick?: (category: string) => void;
    includeGoogleInStats: boolean;
    calendarsInStats: Set<number>;
    googleCalendars: GoogleCalendar[];
    trailingToolbar?: ReactNode;
}

export default function StatisticsSidebar({
    weekDate,
    onMoreInfo,
    onAppsList,
    onCategoryClick,
    includeGoogleInStats,
    calendarsInStats,
    googleCalendars,
    trailingToolbar,
}: StatisticsSidebarProps) {
    const [displayMode, setDisplayMode] = useState<DisplayMode>("percentage");
    const { categorySidebarCount, calendarStartHour } = useSettingsStore();
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const categorizeMenuRef = useRef<HTMLDivElement>(null);
    const [categorizeMenu, setCategorizeMenu] = useState<{
        x: number;
        y: number;
        appName: string;
    } | null>(null);
    const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
    const [skipPendingRegex, setSkipPendingRegex] = useState<string | null>(null);
    const [skipMatchingLogCount, setSkipMatchingLogCount] = useState(0);
    const [isCountingSkipLogs, setIsCountingSkipLogs] = useState(false);

    const { week_start, week_end } = getWeekRange(weekDate, calendarStartHour);
    const prevAnchor = new Date(week_start * 1000);
    prevAnchor.setDate(prevAnchor.getDate() - 7);
    const { week_start: prevWeekStart, week_end: prevWeekEnd } = getWeekRange(
        prevAnchor,
        calendarStartHour
    );

    const {
        data: weekStats,
        isLoading,
        error,
        isError,
        isFetching,
        failureCount,
        failureReason,
    } = useQuery({
        queryKey: ["week_statistics", week_start, week_end, calendarStartHour],
        queryFn: async () => {
            console.log("[WeekStats] queryFn start", { week_start, week_end, calendarStartHour });
            try {
                const stats = await get_week_statistics(week_start, week_end);
                console.log("[WeekStats] queryFn ok", {
                    categories: stats.categories?.length,
                    total_time: stats.total_time,
                });
                return stats;
            } catch (e) {
                console.error("[WeekStats] queryFn threw:", e);
                console.error("[WeekStats] toErrorString:", toErrorString(e));
                console.error("[WeekStats] typeof:", typeof e, "instanceof Error:", e instanceof Error);
                throw e;
            }
        },
    });

    useEffect(() => {
        console.log("[WeekStats] query state", {
            isLoading,
            isFetching,
            isError,
            failureCount,
            failureReason,
            hasData: !!weekStats,
            errorText: error ? toErrorString(error) : null,
        });
    }, [isLoading, isFetching, isError, failureCount, failureReason, weekStats, error]);

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });

    const { data: catRegex = [] } = useQuery({
        queryKey: ["cat_regex"],
        queryFn: get_cat_regex,
    });

    useEffect(() => {
        if (!categorizeMenu) return;
        const close = (e: PointerEvent) => {
            if (categorizeMenuRef.current?.contains(e.target as Node)) return;
            setCategorizeMenu(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setCategorizeMenu(null);
        };
        document.addEventListener("pointerdown", close);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", onKey);
        };
    }, [categorizeMenu]);

    const assignAppCategoryMutation = useMutation({
        mutationFn: async ({
            catId,
            appName,
        }: {
            catId: number;
            appName: string;
        }) => {
            const pattern = exactAppRegexPattern(appName);
            const existing = catRegex.find((r) => r.regex === pattern);
            if (existing?.cat_id === catId) return false;
            if (existing) {
                await update_cat_regex_by_id({ ...existing, cat_id: catId });
            } else {
                await insert_cat_regex({ cat_id: catId, regex: pattern });
            }
            return true;
        },
        onSuccess: (didChange) => {
            setCategorizeMenu(null);
            if (!didChange) return;
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            queryClient.invalidateQueries({ queryKey: ["week"] });
            queryClient.invalidateQueries({ queryKey: ["week_statistics"] });
            queryClient.invalidateQueries({ queryKey: ["day_statistics"] });
            showToast("Category rule saved", "success");
        },
        onError: (e: unknown) => {
            console.error("Failed to save category rule:", e);
            const fullError = JSON.stringify(e, null, 2);
            showToast("Failed to save category rule", "error", 5000, fullError);
        },
    });

    const addSkipPatternMutation = useMutation({
        mutationFn: async (regexPattern: string) => {
            return await insert_skipped_app_and_delete_logs({ regex: regexPattern });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
            queryClient.invalidateQueries({ queryKey: ["week"] });
            queryClient.invalidateQueries({ queryKey: ["week_statistics"] });
            queryClient.invalidateQueries({ queryKey: ["day_statistics"] });
            setCategorizeMenu(null);
            setSkipConfirmOpen(false);
            setSkipPendingRegex(null);
            showToast("Added to skipped apps", "success");
        },
        onError: (e: unknown) => {
            console.error("Failed to add skipped app:", e);
            const fullError = JSON.stringify(e, null, 2);
            showToast("Failed to add skipped app", "error", 5000, fullError);
        },
    });

    const handleAddToSkippedApps = async () => {
        if (!categorizeMenu) return;
        const regexPattern = exactAppRegexPattern(categorizeMenu.appName);
        setIsCountingSkipLogs(true);
        try {
            const count = await count_matching_logs(regexPattern);
            setSkipMatchingLogCount(count);
            setSkipPendingRegex(regexPattern);
            setSkipConfirmOpen(true);
        } catch (e: unknown) {
            console.error("Failed to count matching logs for skip:", e);
            const fullError = JSON.stringify(e, null, 2);
            showToast("Failed to add skipped app", "error", 5000, fullError);
        } finally {
            setIsCountingSkipLogs(false);
        }
    };

    const sortedCategories = useMemo(
        () => [...categories].sort((a, b) => b.priority - a.priority),
        [categories]
    );

    const {
        data: googleEvents,
        isLoading: isLoadingGoogleEvents,
        isError: isGoogleEventsError,
    } = useQuery({
        queryKey: ["google_calendar_events", week_start, week_end, calendarStartHour],
        queryFn: async () => await get_all_google_calendar_events(week_start, week_end),
        enabled: includeGoogleInStats && calendarsInStats.size > 0,
    });

    const {
        data: prevGoogleEvents,
        isLoading: isLoadingPrevGoogleEvents,
        isError: isPrevGoogleEventsError,
    } = useQuery({
        queryKey: ["google_calendar_events", prevWeekStart, prevWeekEnd, calendarStartHour],
        queryFn: async () => await get_all_google_calendar_events(prevWeekStart, prevWeekEnd),
        enabled: includeGoogleInStats && calendarsInStats.size > 0,
    });

    const calendarMap = useMemo(() => {
        const map = new Map<number, GoogleCalendar>();
        googleCalendars.forEach((c) => map.set(c.id, c));
        return map;
    }, [googleCalendars]);

    const filteredGoogleEvents = useMemo(() => {
        const events = (googleEvents ?? []) as GoogleCalendarEvent[];
        if (calendarsInStats.size === 0) return [];
        return events.filter((e) => calendarsInStats.has(e.calendar_id));
    }, [googleEvents, calendarsInStats]);

    const filteredPrevGoogleEvents = useMemo(() => {
        const events = (prevGoogleEvents ?? []) as GoogleCalendarEvent[];
        if (calendarsInStats.size === 0) return [];
        return events.filter((e) => calendarsInStats.has(e.calendar_id));
    }, [prevGoogleEvents, calendarsInStats]);

    const googleCategories = useMemo<CombinedCategory[]>(() => {
        if (!includeGoogleInStats) return [];
        if (isLoadingGoogleEvents || isGoogleEventsError || isLoadingPrevGoogleEvents) return [];

        const compareEnd = Math.min(week_end, Math.floor(Date.now() / 1000));
        const prevCompareEnd = prevWeekStart + (compareEnd - week_start);

        const durationByCalendarId = new Map<number, number>();
        filteredGoogleEvents.forEach((e) => {
            const durationSec = googleEventDurationInRange(e, week_start, week_end, compareEnd);
            if (durationSec <= 0) return;
            durationByCalendarId.set(
                e.calendar_id,
                (durationByCalendarId.get(e.calendar_id) ?? 0) + durationSec
            );
        });

        const prevDurationByCalendarId = new Map<number, number>();
        if (!isPrevGoogleEventsError) {
            filteredPrevGoogleEvents.forEach((e) => {
                const durationSec = googleEventDurationInRange(e, prevWeekStart, prevWeekEnd, prevCompareEnd);
                if (durationSec <= 0) return;
                prevDurationByCalendarId.set(
                    e.calendar_id,
                    (prevDurationByCalendarId.get(e.calendar_id) ?? 0) + durationSec
                );
            });
        }

        const sorted = Array.from(durationByCalendarId.entries()).sort((a, b) => b[1] - a[1]);

        return sorted.map(([calendarId, dur]) => {
            const cal = calendarMap.get(calendarId);
            const name = cal?.name ?? `Calendar ${calendarId}`;
            const color = cal?.color ?? "#4285f4";
            const prevDur = prevDurationByCalendarId.get(calendarId) ?? 0;
            const pctCh = isPrevGoogleEventsError ? null : percentageChangeVsPrevious(dur, prevDur);
            return {
                category: name,
                total_duration: dur,
                percentage: 0,
                percentage_change: pctCh,
                color,
                source: "google" as const,
            };
        });
    }, [
        includeGoogleInStats,
        isLoadingGoogleEvents,
        isGoogleEventsError,
        isLoadingPrevGoogleEvents,
        isPrevGoogleEventsError,
        filteredGoogleEvents,
        filteredPrevGoogleEvents,
        calendarMap,
        week_start,
        week_end,
        prevWeekStart,
        prevWeekEnd,
    ]);

    const prevGoogleTotalDuration = useMemo(() => {
        if (!includeGoogleInStats || isPrevGoogleEventsError) return 0;
        const compareEnd = Math.min(week_end, Math.floor(Date.now() / 1000));
        const prevCompareEnd = prevWeekStart + (compareEnd - week_start);
        let sum = 0;
        filteredPrevGoogleEvents.forEach((e) => {
            sum += googleEventDurationInRange(e, prevWeekStart, prevWeekEnd, prevCompareEnd);
        });
        return sum;
    }, [
        includeGoogleInStats,
        isPrevGoogleEventsError,
        filteredPrevGoogleEvents,
        prevWeekStart,
        prevWeekEnd,
        week_start,
        week_end,
    ]);

    const topCategories = useMemo<CombinedCategory[]>(() => {
        if (!weekStats) return [] as CombinedCategory[];

        const trackingCategories = weekStats.categories.map((c) => ({
            ...c,
            source: "tracking" as const,
        }));

        if (!includeGoogleInStats) {
            return trackingCategories.slice(0, categorySidebarCount);
        }

        const combined = [...trackingCategories, ...googleCategories];
        combined.sort((a, b) => b.total_duration - a.total_duration);
        return combined.slice(0, categorySidebarCount);
    }, [weekStats, includeGoogleInStats, googleCategories, categorySidebarCount]);

    const maxCategoryDuration = topCategories.length > 0 ? topCategories[0].total_duration : 1;

    const donutData = useMemo(() => {
        return topCategories.map((cat) => ({
            label: cat.category,
            value: cat.total_duration,
            color: cat.color || "#6b7280",
        }));
    }, [topCategories]);

    const categoryColors = useMemo(() => {
        const map = new Map<string, string>();
        topCategories.forEach((cat) => {
            if (cat.color) map.set(cat.category, cat.color);
        });
        return map;
    }, [topCategories]);

    const googleTotalDuration = useMemo(() => {
        if (!includeGoogleInStats) return 0;
        return googleCategories.reduce((sum, c) => sum + c.total_duration, 0);
    }, [includeGoogleInStats, googleCategories]);

    const totalTime = useMemo(() => {
        if (!weekStats) return 0;
        if (!includeGoogleInStats) return weekStats.total_time;
        return weekStats.total_time + googleTotalDuration;
    }, [weekStats, includeGoogleInStats, googleTotalDuration]);

    const combinedTotalTimeChange = useMemo((): number | null => {
        if (!weekStats || !includeGoogleInStats) return null;
        if (isLoadingGoogleEvents || isLoadingPrevGoogleEvents) return null;
        const prevTrack = inferPreviousTrackingTotal(weekStats.total_time, weekStats.total_time_change);
        if (prevTrack === null) return null;
        const prevCombined = prevTrack + prevGoogleTotalDuration;
        const currCombined = weekStats.total_time + googleTotalDuration;
        return percentageChangeVsPrevious(currCombined, prevCombined);
    }, [
        weekStats,
        includeGoogleInStats,
        prevGoogleTotalDuration,
        googleTotalDuration,
        isLoadingGoogleEvents,
        isLoadingPrevGoogleEvents,
    ]);

    const displayTotalTimeChange =
        includeGoogleInStats
            ? isLoadingGoogleEvents || isLoadingPrevGoogleEvents
                ? null
                : combinedTotalTimeChange
            : (weekStats?.total_time_change ?? null);

    const showTotalChange = displayTotalTimeChange !== null;

    const calculateTimeChange = (currentDuration: number, percentageChange: number): number => {
        if (percentageChange === 0) return 0;
        if (percentageChange === -100) return -1;
        return (currentDuration * percentageChange) / (100 + percentageChange);
    };

    const formatChange = (currentDuration: number, percentageChange: number | null): string | null => {
        if (percentageChange === null) return null;
        if (displayMode === "time") {
            const timeChange = calculateTimeChange(currentDuration, percentageChange);
            const sign = timeChange >= 0 ? "+" : "";
            return `${sign}${formatDuration(Math.abs(timeChange))}`;
        }
        return formatPercentage(percentageChange);
    };

    const canClickCategory = (cat: CombinedCategory) => {
        return !!onCategoryClick && cat.source === "tracking";
    };

    if (isLoading || (!weekStats && !isError)) {
        return (
            <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <h2 className="text-xl font-bold text-white min-w-0 truncate">Week Statistics</h2>
                        {trailingToolbar}
                    </div>
                    <div className="text-gray-500 mb-4">Loading statistics...</div>
                </div>
                <div className="mt-auto pt-4 border-t border-gray-700">
                    <button
                        onClick={onMoreInfo}
                        className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm"
                    >
                        More Info &gt;
                    </button>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <h2 className="text-xl font-bold text-white min-w-0 truncate">Week Statistics</h2>
                        {trailingToolbar}
                    </div>
                    <div className="text-red-400 mb-2">Error loading statistics</div>
                    <div className="text-gray-500 text-sm mb-4">
                        {toErrorString(error)}
                    </div>
                </div>
                <div className="mt-auto pt-4 border-t border-gray-700">
                    <button
                        onClick={onMoreInfo}
                        className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm"
                    >
                        More Info &gt;
                    </button>
                </div>
            </div>
        );
    }

    if (!weekStats) {
        return (
            <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <h2 className="text-xl font-bold text-white min-w-0 truncate">Week Statistics</h2>
                        {trailingToolbar}
                    </div>
                    <div className="text-gray-500 mb-4">No statistics available</div>
                </div>
                <div className="mt-auto pt-4 border-t border-gray-700">
                    <button
                        onClick={onMoreInfo}
                        className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm"
                    >
                        More Info &gt;
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
            <div className="flex justify-between items-center gap-2 mb-4 min-w-0">
                <h2 className="text-xl font-bold text-white min-w-0 truncate">Week Statistics</h2>
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex gap-1 bg-gray-800 rounded p-1">
                        <button
                            onClick={() => setDisplayMode("percentage")}
                            className={`px-2 py-1 text-xs rounded ${
                                displayMode === "percentage" ? "bg-gray-700 text-white" : "text-gray-400"
                            }`}
                        >
                            %
                        </button>
                        <button
                            onClick={() => setDisplayMode("time")}
                            className={`px-2 py-1 text-xs rounded ${
                                displayMode === "time" ? "bg-gray-700 text-white" : "text-gray-400"
                            }`}
                        >
                            Time
                        </button>
                    </div>
                    {trailingToolbar}
                </div>
            </div>

            <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-400">Total time</span>
                    <span className="text-lg font-semibold text-white">{formatDuration(totalTime)}</span>
                </div>
                {showTotalChange && (
                    <div
                        className={`text-xs min-w-[50px] text-right ${
                            displayTotalTimeChange! >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {displayMode === "time"
                            ? (() => {
                                  const timeChange = calculateTimeChange(
                                      totalTime,
                                      displayTotalTimeChange!
                                  );
                                  const sign = timeChange >= 0 ? "+" : "";
                                  return `${sign}${formatDuration(Math.abs(timeChange))}`;
                              })()
                            : formatPercentage(displayTotalTimeChange!)}
                    </div>
                )}
            </div>

            <div className="mb-6">
                <DonutChart data={donutData} colors={categoryColors} />
            </div>

            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Categories</h3>
                <div className="space-y-2">
                    {topCategories.map((cat, idx) => {
                        const clickable = canClickCategory(cat);
                        const onClick = clickable ? () => onCategoryClick?.(cat.category) : undefined;
                        return (
                            <div key={`${cat.category}-${idx}`} className="space-y-1">
                                <div
                                    className={`flex items-center justify-between ${
                                        clickable ? "cursor-pointer hover:bg-gray-800 rounded p-1 -m-1 transition-colors" : ""
                                    }`}
                                    onClick={onClick}
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: cat.color || "#6b7280" }}
                                        />
                                        <span className="text-sm text-gray-200">{cat.category}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">{formatDuration(cat.total_duration)}</span>
                                        {formatChange(cat.total_duration, cat.percentage_change) !== null && (
                                            <span
                                                className={`text-xs min-w-[50px] text-right ${
                                                    cat.percentage_change! >= 0 ? "text-green-400" : "text-red-400"
                                                }`}
                                            >
                                                {formatChange(cat.total_duration, cat.percentage_change)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full"
                                        style={{
                                            width: `${(cat.total_duration / maxCategoryDuration) * 100}%`,
                                            backgroundColor: cat.color || "#6b7280",
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-300">Top Apps</h3>
                    {onAppsList && (
                        <button
                            onClick={onAppsList}
                            className="text-xs text-blue-400 hover:text-blue-300"
                        >
                            More Info
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {weekStats.top_apps.map((app, idx) => (
                        <div
                            key={`${app.app}-${idx}`}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCategorizeMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    appName: app.app,
                                });
                            }}
                            className="flex items-center justify-between rounded px-1 -mx-1 hover:bg-gray-900/80"
                        >
                            <span className="text-sm text-gray-200 truncate min-w-0 pr-2">{app.app}</span>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm text-gray-400">{formatDuration(app.total_duration)}</span>
                                {formatChange(app.total_duration, app.percentage_change) !== null && (
                                    <span
                                        className={`text-xs min-w-[50px] text-right ${
                                            app.percentage_change! >= 0 ? "text-green-400" : "text-red-400"
                                        }`}
                                    >
                                        {formatChange(app.total_duration, app.percentage_change)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-700">
                <button
                    onClick={onMoreInfo}
                    className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm"
                >
                    More Info &gt;
                </button>
            </div>

            {categorizeMenu && (
                <div
                    ref={categorizeMenuRef}
                    className="fixed z-[200] min-w-[12rem] max-h-64 overflow-y-auto nice-scrollbar rounded-lg border border-gray-600 bg-gray-900 py-1 shadow-xl"
                    style={{ left: categorizeMenu.x, top: categorizeMenu.y }}
                    role="menu"
                >
                    <div
                        className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 truncate"
                        title={categorizeMenu.appName}
                    >
                        {categorizeMenu.appName}
                    </div>
                    {sortedCategories.map((cat) => (
                        <button
                            key={cat.id}
                            type="button"
                            disabled={assignAppCategoryMutation.isPending}
                            className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                            onClick={() =>
                                assignAppCategoryMutation.mutate({
                                    catId: cat.id,
                                    appName: categorizeMenu.appName,
                                })
                            }
                        >
                            {cat.name}
                        </button>
                    ))}
                    <div className="border-t border-gray-700 my-1" />
                    <button
                        type="button"
                        disabled={isCountingSkipLogs || addSkipPatternMutation.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-gray-800 disabled:opacity-50"
                        onClick={handleAddToSkippedApps}
                    >
                        {isCountingSkipLogs ? "Checking..." : "Add to skipped apps"}
                    </button>
                </div>
            )}

            {skipConfirmOpen && skipPendingRegex && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[250]">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white">Confirm Skip</h3>
                        <p className="text-gray-300 mb-2">
                            This will permanently delete{" "}
                            <span className="text-red-400 font-semibold">
                                {skipMatchingLogCount} log{skipMatchingLogCount !== 1 ? "s" : ""}
                            </span>{" "}
                            that match the selected app.
                        </p>
                        {skipMatchingLogCount > 0 && (
                            <p className="text-yellow-400 text-sm mb-4">
                                ⚠️ This action cannot be undone!
                            </p>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setSkipConfirmOpen(false);
                                    setSkipPendingRegex(null);
                                }}
                                disabled={addSkipPatternMutation.isPending}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => addSkipPatternMutation.mutate(skipPendingRegex)}
                                disabled={addSkipPatternMutation.isPending}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
                            >
                                {addSkipPatternMutation.isPending ? "Adding..." : "Delete Logs & Add Pattern"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

