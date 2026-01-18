import {useQuery} from "@tanstack/react-query";
import {get_day_statistics} from "../../../api/statistics.ts";
import {unwrapResult} from "../../../utils.ts";
import {formatDuration} from "../utils.ts";
import {DonutChart} from "../DonutChart.tsx";

interface DayStatisticsSidebarProps {
    selectedDate: Date;
    onMoreInfo: () => void;
    onClose: () => void;
}

export default function DayStatisticsSidebar({selectedDate, onMoreInfo, onClose}: DayStatisticsSidebarProps) {
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
        isError
    } = useQuery({
        queryKey: ["day_statistics", dayStart, dayEnd],
        queryFn: async () => {
            if (!dayStart || !dayEnd) return null;
            try {
                const result = await get_day_statistics(dayStart, dayEnd);
                return unwrapResult(result);
            } catch (error) {
                throw error;
            }
        },
        enabled: !!dayStart && !!dayEnd,
    });

    // Show loading or error state
    if (isLoading || (!dayStats && !isError)) {
        return (
            <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">Day Statistics</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
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
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">Day Statistics</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
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

    // At this point, dayStats should be defined, but TypeScript needs a check
    if (!dayStats) {
        return (
            <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">Day Statistics</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
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
    dayStats.categories.forEach(cat => {
        if (cat.color) {
            categoryColors.set(cat.category, cat.color);
        }
    });

    const donutData = dayStats.categories.slice(0, 5).map(cat => ({
        label: cat.category,
        value: cat.total_duration,
        color: cat.color || "#6b7280",
    }));

    const topCategories = dayStats.categories.slice(0, 5);
    const maxCategoryDuration = topCategories.length > 0 ? topCategories[0].total_duration : 1;

    return (
        <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Day Statistics</h2>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label="Close"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            {/* Total Time */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-400">Total time</span>
                    <span className="text-lg font-semibold text-white">{formatDuration(dayStats.total_time)}</span>
                </div>
            </div>

            {/* Donut Chart */}
            <div className="mb-6">
                <DonutChart data={donutData} colors={categoryColors}/>
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
                                        style={{backgroundColor: cat.color || "#6b7280"}}
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
                    ))}
                </div>
            </div>

            {/* Top Apps */}
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
