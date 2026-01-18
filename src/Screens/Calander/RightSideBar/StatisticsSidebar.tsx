import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { get_week_statistics } from "../../../api/statistics.ts";
import { unwrapResult, getWeekRange } from "../../../utils.ts";
import { formatDuration, formatPercentage } from "../utils.ts";
import { DonutChart } from "../DonutChart.tsx";

type DisplayMode = "percentage" | "time" | "count";


interface StatisticsSidebarProps {
    weekDate: Date;
    onMoreInfo: () => void;
    onAppsList?: () => void;
}

export default function StatisticsSidebar({ weekDate, onMoreInfo, onAppsList }: StatisticsSidebarProps) {
    const [displayMode, setDisplayMode] = useState<DisplayMode>("percentage");

    const { week_start, week_end } = getWeekRange(weekDate);

    // Build and log the query event before executing
    useEffect(() => {

    }, [week_start, week_end]);

    const {
        data: weekStats,
        isLoading,
        error,
        isError
    } = useQuery({
        queryKey: ["week_statistics", week_start, week_end],
        queryFn: async () => {
            try {
                const result = await get_week_statistics(week_start, week_end);
                return unwrapResult(result);
            } catch (error) {
                throw error;
            }
        },
    });

    const stats = weekStats;


    // Show loading or error state, but always show the "More Info" button
    if (isLoading || (!stats && !isError)) {
        return (
            <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-4">
                        Week Statistics
                    </h2>
                    <div className="text-gray-500 mb-4">Loading statistics...</div>
                </div>
                {/* Footer - Always show More Info button even while loading */}
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
            <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-4">
                        Week Statistics
                    </h2>
                    <div className="text-red-400 mb-2">Error loading statistics</div>
                    <div className="text-gray-500 text-sm mb-4">
                        {error instanceof Error ? error.message : "Unknown error occurred"}
                    </div>
                </div>
                {/* Footer - Always show More Info button even on error */}
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

    // At this point, stats should be defined, but TypeScript needs a check
    if (!stats) {
        return (
            <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-4">
                        Week Statistics
                    </h2>
                    <div className="text-gray-500 mb-4">No statistics available</div>
                </div>
                {/* Footer - Always show More Info button */}
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

    const categoryColors = new Map<string, string>();
    stats.categories.forEach(cat => {
        if (cat.color) {
            categoryColors.set(cat.category, cat.color);
        }
    });

    const donutData = stats.categories.slice(0, 5).map(cat => ({
        label: cat.category,
        value: cat.total_duration,
        color: cat.color || "#6b7280",
    }));

    const topCategories = stats.categories.slice(0, 5);
    const maxCategoryDuration = topCategories.length > 0 ? topCategories[0].total_duration : 1;

    return (
        <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">
                    Week Statistics
                </h2>
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

            {/* Total Time */}
            {stats && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-400">Total time</span>
                        <span className="text-lg font-semibold text-white">{formatDuration(stats.total_time)}</span>
                    </div>
                    {stats.total_time_change !== null && (
                        <div
                            className={`text-xs ${stats.total_time_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {formatPercentage(stats.total_time_change)}
                        </div>
                    )}
                </div>
            )}

            {/* Donut Chart */}
            <div className="mb-6">
                <DonutChart data={donutData} colors={categoryColors} />
            </div>

            {/* Categories */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Categories</h3>
                <div className="space-y-2">
                    {topCategories.map((cat, idx) => (
                        <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: cat.color || "#6b7280" }}
                                    />
                                    <span className="text-sm text-gray-200">{cat.category}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-400">{formatDuration(cat.total_duration)}</span>
                                    {cat.percentage_change !== null && (
                                        <span
                                            className={`text-xs ${cat.percentage_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                                            {formatPercentage(cat.percentage_change)}
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
                    ))}
                </div>
            </div>

            {/* Top Apps */}
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
                    {stats.top_apps.map((app, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                            <span className="text-sm text-gray-200">{app.app}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-400">{formatDuration(app.total_duration)}</span>
                                {app.percentage_change !== null && (
                                    <span
                                        className={`text-xs ${app.percentage_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                                        {formatPercentage(app.percentage_change)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
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
