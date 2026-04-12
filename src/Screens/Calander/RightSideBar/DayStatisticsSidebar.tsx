import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { get_day_statistics } from "../../../api/statistics.ts";
import { getCalendarDayRangeUnix } from "../../../utils.ts";
import { useSettingsStore } from "../../../stores/settingsStore.ts";
import { formatDuration } from "../utils.ts";
import { DonutChart } from "../DonutChart.tsx";
import {
    get_all_google_calendar_events,
    googleEventDurationInRange,
    GoogleCalendar,
    GoogleCalendarEvent,
} from "../../../api/GoogleCalendar.ts";
import { toErrorString } from "../../../types/common.ts";
import { useToast } from "../../../Componants/Toast.tsx";
import { get_categories } from "../../../api/Category.ts";
import { get_cat_regex, insert_cat_regex, update_cat_regex_by_id } from "../../../api/CategoryRegex.ts";
import { count_matching_logs, insert_skipped_app_and_delete_logs } from "../../../api/SkippedApp.ts";

function exactAppRegexPattern(appName: string): string {
    const escaped = appName.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    return `^${escaped}$`;
}

interface DayStatisticsSidebarProps {
    selectedDate: Date;
    onMoreInfo: () => void;
    onClose: () => void;
    onCategoryClick?: (category: string) => void;
    includeGoogleInStats: boolean;
    calendarsInStats: Set<number>;
    googleCalendars: GoogleCalendar[];
    trailingToolbar?: ReactNode;
}

type CombinedCategory = {
    category: string;
    total_duration: number;
    color: string | null;
    source: "tracking" | "google";
};

export default function DayStatisticsSidebar({
    selectedDate,
    onMoreInfo,
    onClose,
    onCategoryClick,
    includeGoogleInStats,
    calendarsInStats,
    googleCalendars,
    trailingToolbar,
}: DayStatisticsSidebarProps) {
    const { calendarStartHour, categorySidebarCount } = useSettingsStore();
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

    const { day_start: dayStart, day_end: dayEnd } = useMemo(
        () => getCalendarDayRangeUnix(selectedDate, calendarStartHour),
        [selectedDate, calendarStartHour]
    );

    const dayStatsEnabled = !!dayStart && !!dayEnd;
    const {
        data: dayStats,
        isLoading,
        error,
        isError,
        isFetching,
        failureCount,
    } = useQuery({
        queryKey: ["day_statistics", dayStart, dayEnd],
        queryFn: async () => {
            if (!dayStart || !dayEnd) return null;
            console.log("[DayStats] queryFn start", { dayStart, dayEnd });
            try {
                const stats = await get_day_statistics(dayStart, dayEnd);
                console.log("[DayStats] queryFn ok", {
                    categories: stats.categories?.length,
                    total_time: stats.total_time,
                });
                return stats;
            } catch (e) {
                console.error("[DayStats] queryFn threw:", e);
                console.error("[DayStats] toErrorString:", toErrorString(e));
                throw e;
            }
        },
        enabled: dayStatsEnabled,
    });

    useEffect(() => {
        console.log("[DayStats] query state", {
            enabled: dayStatsEnabled,
            isLoading,
            isFetching,
            isError,
            failureCount,
            hasData: !!dayStats,
            errorText: error ? toErrorString(error) : null,
        });
    }, [dayStatsEnabled, isLoading, isFetching, isError, failureCount, dayStats, error]);

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
        queryKey: ["google_calendar_events", dayStart, dayEnd],
        queryFn: async () => await get_all_google_calendar_events(dayStart, dayEnd),
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

    const googleCategories = useMemo(() => {
        if (!includeGoogleInStats) return [] as CombinedCategory[];
        if (isLoadingGoogleEvents || isGoogleEventsError) return [] as CombinedCategory[];

        const nowSec = Math.floor(Date.now() / 1000);
        const durationByCalendarId = new Map<number, number>();
        filteredGoogleEvents.forEach((e) => {
            const durationSec = googleEventDurationInRange(e, dayStart, dayEnd, nowSec);
            if (durationSec <= 0) return;
            durationByCalendarId.set(
                e.calendar_id,
                (durationByCalendarId.get(e.calendar_id) ?? 0) + durationSec
            );
        });

        const sorted = Array.from(durationByCalendarId.entries()).sort((a, b) => b[1] - a[1]);

        return sorted.map(([calendarId, dur]) => {
            const cal = calendarMap.get(calendarId);
            const name = cal?.name ?? `Calendar ${calendarId}`;
            const color = cal?.color ?? "#4285f4";
            return {
                category: name,
                total_duration: dur,
                color,
                source: "google",
            };
        });
    }, [includeGoogleInStats, isLoadingGoogleEvents, isGoogleEventsError, filteredGoogleEvents, calendarMap]);

    const topCategories = useMemo(() => {
        if (!dayStats) return [] as CombinedCategory[];

        const trackingCategories: CombinedCategory[] = dayStats.categories.map((c) => ({
            category: c.category,
            total_duration: c.total_duration,
            color: c.color,
            source: "tracking",
        }));

        if (!includeGoogleInStats) {
            return trackingCategories.slice(0, categorySidebarCount);
        }

        const combined = [...trackingCategories, ...googleCategories];
        combined.sort((a, b) => b.total_duration - a.total_duration);
        return combined.slice(0, categorySidebarCount);
    }, [dayStats, includeGoogleInStats, googleCategories, categorySidebarCount]);

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
        if (!dayStats) return 0;
        if (!includeGoogleInStats) return dayStats.total_time;
        return dayStats.total_time + googleTotalDuration;
    }, [dayStats, includeGoogleInStats, googleTotalDuration]);

    if (isLoading || (!dayStats && !isError)) {
        return (
            <div className=" border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4 gap-2">
                        <h2 className="text-xl font-bold text-white min-w-0 truncate">Day Statistics</h2>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                            {trailingToolbar}
                        </div>
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
            <div className=" border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4 gap-2">
                        <h2 className="text-xl font-bold text-white min-w-0 truncate">Day Statistics</h2>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                            {trailingToolbar}
                        </div>
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

    if (!dayStats) {
        return (
            <div className=" border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4 gap-2">
                        <h2 className="text-xl font-bold text-white min-w-0 truncate">Day Statistics</h2>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                            {trailingToolbar}
                        </div>
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
        <div className=" border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-xl font-bold text-white min-w-0 truncate">Day Statistics</h2>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                    {trailingToolbar}
                </div>
            </div>

            <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-400">Total time</span>
                    <span className="text-lg font-semibold text-white">{formatDuration(totalTime)}</span>
                </div>
            </div>

            <div className="mb-6">
                <DonutChart data={donutData} colors={categoryColors} />
            </div>

            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Categories</h3>
                <div className="space-y-2">
                    {topCategories.map((cat, idx) => {
                        const clickable = !!onCategoryClick && cat.source === "tracking";
                        const onClick = clickable ? () => onCategoryClick?.(cat.category) : undefined;
                        return (
                            <div key={`${cat.category}-${idx}`} className="space-y-1">
                                <div
                                    className={`flex items-center justify-between ${
                                        clickable
                                            ? "cursor-pointer hover:bg-gray-800 rounded p-1 -m-1 transition-colors"
                                            : ""
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
                                    <span className="text-sm text-gray-400">{formatDuration(cat.total_duration)}</span>
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
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Top Apps</h3>
                <div className="space-y-2">
                    {dayStats.top_apps.map((app, idx) => (
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
                            <span className="text-sm text-gray-400 shrink-0">
                                {formatDuration(app.total_duration)}
                            </span>
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

