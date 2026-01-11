import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { get_week_statistics, get_day_statistics, WeekStatistics, DayStatistics } from "../api/statistics.ts";
import { unwrapResult, getWeekRange } from "../utils.ts";

type DisplayMode = "percentage" | "time" | "count";

// Builder pattern for logging events
class LogEventBuilder {
    private event: { [key: string]: any } = {};

    static create(eventName: string): LogEventBuilder {
        const builder = new LogEventBuilder();
        builder.event.name = eventName;
        builder.event.timestamp = new Date().toISOString();
        return builder;
    }

    withData(key: string, value: any): LogEventBuilder {
        this.event[key] = value;
        return this;
    }

    withError(error: any): LogEventBuilder {
        this.event.error = {
            message: error?.message || String(error),
            stack: error?.stack,
            type: error?.type,
            data: error?.data,
        };
        return this;
    }

    log(): void {
        console.log("[StatisticsSidebar]", JSON.stringify(this.event, null, 2));
    }
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

function formatPercentage(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function DonutChart({ data, colors }: { data: { label: string; value: number; color: string }[]; colors: Map<string, string> }) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
        return (
            <div className="w-full h-48 flex items-center justify-center text-gray-500">
                No data
            </div>
        );
    }

    let currentAngle = -90; // Start at top
    const radius = 60;
    const centerX = 80;
    const centerY = 80;

    const paths = data.map((item, index) => {
        const percentage = (item.value / total) * 100;
        const angle = (percentage / 100) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;

        const x1 = centerX + radius * Math.cos((startAngle * Math.PI) / 180);
        const y1 = centerY + radius * Math.sin((startAngle * Math.PI) / 180);
        const x2 = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
        const y2 = centerY + radius * Math.sin((endAngle * Math.PI) / 180);

        const largeArcFlag = angle > 180 ? 1 : 0;

        const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

        currentAngle += angle;

        return (
            <path
                key={index}
                d={pathData}
                fill={item.color || colors.get(item.label) || "#6b7280"}
                className="hover:opacity-80 transition-opacity"
            />
        );
    });

    return (
        <div className="w-full flex justify-center">
            <svg width="160" height="160" viewBox="0 0 160 160">
                {paths}
                <circle cx={centerX} cy={centerY} r={radius * 0.6} fill="#111827" />
                <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="14" fontWeight="bold">
                    {formatDuration(total)}
                </text>
            </svg>
        </div>
    );
}

interface StatisticsSidebarProps {
    selectedDate: Date | null;
    weekDate: Date;
    onMoreInfo: () => void;
    onAppsList?: () => void;
}

export default function StatisticsSidebar({ selectedDate, weekDate, onMoreInfo, onAppsList }: StatisticsSidebarProps) {
    const [displayMode, setDisplayMode] = useState<DisplayMode>("percentage");

    const { week_start, week_end } = getWeekRange(weekDate);

    // Build and log the query event before executing
    useEffect(() => {
        LogEventBuilder.create("week_statistics_query_started")
            .withData("week_start", week_start)
            .withData("week_end", week_end)
            .withData("week_start_date", new Date(week_start * 1000).toISOString())
            .withData("week_end_date", new Date(week_end * 1000).toISOString())
            .log();
    }, [week_start, week_end]);

    const { 
        data: weekStats, 
        isLoading: isLoadingWeek, 
        error: weekError,
        isError: isWeekError 
    } = useQuery({
        queryKey: ["week_statistics", week_start, week_end],
        queryFn: async () => {
            LogEventBuilder.create("week_statistics_query_executing")
                .withData("week_start", week_start)
                .withData("week_end", week_end)
                .log();
            
            try {
                const result = await get_week_statistics(week_start, week_end);
                
                LogEventBuilder.create("week_statistics_query_result")
                    .withData("success", result.success)
                    .withData("week_start", week_start)
                    .withData("week_end", week_end)
                    .log();
                
                if (!result.success) {
                    LogEventBuilder.create("week_statistics_query_error")
                        .withData("week_start", week_start)
                        .withData("week_end", week_end)
                        .withError(result.error)
                        .log();
                }
                
                return unwrapResult(result);
            } catch (error) {
                LogEventBuilder.create("week_statistics_query_exception")
                    .withData("week_start", week_start)
                    .withData("week_end", week_end)
                    .withError(error)
                    .log();
                throw error;
            }
        },
    });

    const dayStart = selectedDate ? Math.floor(new Date(selectedDate.setHours(0, 0, 0, 0)).getTime() / 1000) : null;
    const dayEnd = selectedDate ? Math.floor(new Date(selectedDate.setHours(23, 59, 59, 999)).getTime() / 1000) : null;

    useEffect(() => {
        if (dayStart && dayEnd) {
            LogEventBuilder.create("day_statistics_query_started")
                .withData("day_start", dayStart)
                .withData("day_end", dayEnd)
                .withData("day_start_date", new Date(dayStart * 1000).toISOString())
                .withData("day_end_date", new Date(dayEnd * 1000).toISOString())
                .log();
        }
    }, [dayStart, dayEnd]);

    const { 
        data: dayStats, 
        isLoading: isLoadingDay, 
        error: dayError,
        isError: isDayError 
    } = useQuery({
        queryKey: ["day_statistics", dayStart, dayEnd],
        queryFn: async () => {
            if (!dayStart || !dayEnd) return null;
            
            LogEventBuilder.create("day_statistics_query_executing")
                .withData("day_start", dayStart)
                .withData("day_end", dayEnd)
                .log();
            
            try {
                const result = await get_day_statistics(dayStart, dayEnd);
                
                LogEventBuilder.create("day_statistics_query_result")
                    .withData("success", result.success)
                    .withData("day_start", dayStart)
                    .withData("day_end", dayEnd)
                    .log();
                
                if (!result.success) {
                    LogEventBuilder.create("day_statistics_query_error")
                        .withData("day_start", dayStart)
                        .withData("day_end", dayEnd)
                        .withError(result.error)
                        .log();
                }
                
                return unwrapResult(result);
            } catch (error) {
                LogEventBuilder.create("day_statistics_query_exception")
                    .withData("day_start", dayStart)
                    .withData("day_end", dayEnd)
                    .withError(error)
                    .log();
                throw error;
            }
        },
        enabled: !!dayStart && !!dayEnd,
    });

    const stats = (selectedDate && dayStats) ? dayStats : weekStats;
    const isWeekView = !selectedDate || !dayStats;
    const isLoading = isWeekView ? isLoadingWeek : isLoadingDay;
    const error = isWeekView ? weekError : dayError;
    const isError = isWeekView ? isWeekError : isDayError;

    // Log when stats change
    useEffect(() => {
        if (stats) {
            LogEventBuilder.create("statistics_loaded")
                .withData("isWeekView", isWeekView)
                .withData("total_time", stats.total_time)
                .withData("categories_count", stats.categories.length)
                .withData("top_apps_count", stats.top_apps.length)
                .log();
        }
    }, [stats, isWeekView]);

    // Show loading or error state, but always show the "More Info" button
    if (isLoading || (!stats && !isError)) {
        return (
            <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-4">
                        {isWeekView ? "Week Statistics" : "Day Statistics"}
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
        LogEventBuilder.create("statistics_error_displayed")
            .withData("isWeekView", isWeekView)
            .withError(error)
            .log();
        
        return (
            <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-4">
                        {isWeekView ? "Week Statistics" : "Day Statistics"}
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
                        {isWeekView ? "Week Statistics" : "Day Statistics"}
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
                    {isWeekView ? "Week Statistics" : "Day Statistics"}
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
            {isWeekView && weekStats && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-400">Total time</span>
                        <span className="text-lg font-semibold text-white">{formatDuration(weekStats.total_time)}</span>
                    </div>
                    {weekStats.total_time_change !== null && (
                        <div className={`text-xs ${weekStats.total_time_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {formatPercentage(weekStats.total_time_change)}
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
                                    {isWeekView && cat.percentage_change !== null && (
                                        <span className={`text-xs ${cat.percentage_change >= 0 ? "text-green-400" : "text-red-400"}`}>
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
                                {isWeekView && app.percentage_change !== null && (
                                    <span className={`text-xs ${app.percentage_change >= 0 ? "text-green-400" : "text-red-400"}`}>
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
