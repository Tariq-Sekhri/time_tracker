import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { get_day_statistics } from "../../../api/statistics.ts";
import { formatDuration } from "../utils.ts";
import { DonutChart } from "../DonutChart.tsx";

interface DayStatisticsSidebarProps {
    selectedDate: Date;
    onMoreInfo: () => void;
    onClose: () => void;
    onCategoryClick?: (category: string) => void;
}

type CombinedCategory = {
    category: string;
    total_duration: number;
    color: string | null;
    source: "tracking";
};

export default function DayStatisticsSidebar({
    selectedDate,
    onMoreInfo,
    onClose,
    onCategoryClick,
}: DayStatisticsSidebarProps) {
    const dayStartDate = new Date(selectedDate);
    dayStartDate.setHours(0, 0, 0, 0);
    const dayStart = Math.floor(dayStartDate.getTime() / 1000);

    const dayEndDate = new Date(selectedDate);
    dayEndDate.setHours(23, 59, 59, 999);
    const dayEnd = Math.floor(dayEndDate.getTime() / 1000);

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

    const topCategories = useMemo(() => {
        if (!dayStats) return [] as CombinedCategory[];
        return dayStats.categories.slice(0, 5).map((c) => ({
            category: c.category,
            total_duration: c.total_duration,
            color: c.color,
            source: "tracking",
        }));
    }, [dayStats]);

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

    const totalTime = useMemo(() => {
        if (!dayStats) return 0;
        return dayStats.total_time;
    }, [dayStats]);

    if (isLoading || (!dayStats && !isError)) {
        return (
            <div className=" border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">Day Statistics</h2>
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
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">Day Statistics</h2>
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
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">Day Statistics</h2>
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
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Day Statistics</h2>
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

