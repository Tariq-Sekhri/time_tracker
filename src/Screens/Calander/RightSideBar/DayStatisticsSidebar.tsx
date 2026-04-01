import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
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
    const { calendarStartHour } = useSettingsStore();
    const { day_start: dayStart, day_end: dayEnd } = useMemo(
        () => getCalendarDayRangeUnix(selectedDate, calendarStartHour),
        [selectedDate, calendarStartHour]
    );

    const {
        data: dayStats,
        isLoading,
        error,
        isError,
    } = useQuery({
        queryKey: ["day_statistics", dayStart, dayEnd],
        queryFn: async () => {
            if (!dayStart || !dayEnd) return null;
            return await get_day_statistics(dayStart, dayEnd);
        },
        enabled: !!dayStart && !!dayEnd,
    });

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
            return trackingCategories.slice(0, 5);
        }

        const combined = [...trackingCategories, ...googleCategories];
        combined.sort((a, b) => b.total_duration - a.total_duration);
        return combined.slice(0, 5);
    }, [dayStats, includeGoogleInStats, googleCategories]);

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
                        {error instanceof Error ? error.message : "Unknown error occurred"}
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
                        <div key={idx} className="flex items-center justify-between">
                            <span className="text-sm text-gray-200">{app.app}</span>
                            <span className="text-sm text-gray-400">{formatDuration(app.total_duration)}</span>
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
        </div>
    );
}

