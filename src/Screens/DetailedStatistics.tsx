import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import {get_week_statistics, WeekStatistics} from "../api/statistics.ts";
import {unwrapResult, getWeekRange} from "../utils.ts";
import {useDateStore} from "../stores/dateStore.ts";

type Tab = "week" | "dailyAvg" | "total";

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

function formatPercentage(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}


export default function DetailedStatistics({onBack}: { onBack: () => void }) {
    const [activeTab, setActiveTab] = useState<Tab>("week");
    const [displayMode, setDisplayMode] = useState<"percentage" | "time" | "count">("percentage");
    const {date, setDate} = useDateStore();
    const {week_start, week_end} = getWeekRange(date);
    const {data: weekStats, isLoading} = useQuery({
        queryKey: ["week_statistics", week_start, week_end],
        queryFn: async () => unwrapResult(await get_week_statistics(week_start, week_end)),
    });

    if (isLoading || !weekStats) {
        return (
            <div className="p-6">
                <div className="text-gray-500">Loading statistics...</div>
            </div>
        );
    }

    // Calculate daily average
    const dailyAvgStats: WeekStatistics = {
        ...weekStats,
        total_time: weekStats.number_of_active_days > 0
            ? Math.floor(weekStats.total_time / weekStats.number_of_active_days)
            : 0,
        categories: weekStats.categories.map(cat => ({
            ...cat,
            total_duration: weekStats.number_of_active_days > 0
                ? Math.floor(cat.total_duration / weekStats.number_of_active_days)
                : 0,
        })),
        top_apps: weekStats.top_apps.map(app => ({
            ...app,
            total_duration: weekStats.number_of_active_days > 0
                ? Math.floor(app.total_duration / weekStats.number_of_active_days)
                : 0,
        })),
    };

    const stats = activeTab === "week" ? weekStats : activeTab === "dailyAvg" ? dailyAvgStats : weekStats;

    // Group day category breakdown by day
    const dayCategoryMap = new Map<number, Map<string, number>>();
    weekStats.day_category_breakdown.forEach(item => {
        if (!dayCategoryMap.has(item.day)) {
            dayCategoryMap.set(item.day, new Map());
        }
        dayCategoryMap.get(item.day)!.set(item.category, item.total_duration);
    });

    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const maxDayTotal = Math.max(...Array.from(dayCategoryMap.values()).map(dayMap =>
        Array.from(dayMap.values()).reduce((sum, val) => sum + val, 0)
    ), 1);

    return (
        <div className="p-6 text-white h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={onBack}
                    className="text-gray-400 hover:text-white"
                >
                    ← Back
                </button>
                <h1 className="text-2xl font-bold">Detailed Statistics</h1>
                <div className="w-20"></div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-700">
                <button
                    onClick={() => setActiveTab("week")}
                    className={`px-4 py-2 font-medium ${activeTab === "week" ? "border-b-2 border-blue-500 text-white" : "text-gray-400"}`}
                >
                    Week
                </button>
                <button
                    onClick={() => setActiveTab("dailyAvg")}
                    className={`px-4 py-2 font-medium ${activeTab === "dailyAvg" ? "border-b-2 border-blue-500 text-white" : "text-gray-400"}`}
                >
                    Daily Avg
                </button>
                <button
                    onClick={() => setActiveTab("total")}
                    className={`px-4 py-2 font-medium ${activeTab === "total" ? "border-b-2 border-blue-500 text-white" : "text-gray-400"}`}
                >
                    Total
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-1">First Active Day</div>
                    <div className="text-lg font-semibold">
                        {weekStats.first_active_day ? formatDate(weekStats.first_active_day) : "N/A"}
                    </div>
                </div>
                <div className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-1">Active Days</div>
                    <div className="text-lg font-semibold">
                        {weekStats.number_of_active_days} / {weekStats.total_number_of_days}
                    </div>
                </div>
                <div className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-1">All Time Today</div>
                    <div className="text-lg font-semibold">{formatDuration(weekStats.all_time_today)}</div>
                </div>
                <div className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-1">Total Time</div>
                    <div className="text-lg font-semibold">{formatDuration(weekStats.total_time_all_time)}</div>
                </div>
                <div className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-1">Avg Time (Active Days)</div>
                    <div
                        className="text-lg font-semibold">{formatDuration(Math.floor(weekStats.average_time_active_days))}</div>
                </div>
                <div className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-1">Most Active Day</div>
                    <div className="text-lg font-semibold">
                        {weekStats.most_active_day
                            ? `${formatDate(weekStats.most_active_day[0])} (${formatDuration(weekStats.most_active_day[1])})`
                            : "N/A"}
                    </div>
                </div>
                <div className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-1">Most Inactive Day</div>
                    <div className="text-lg font-semibold">
                        {weekStats.most_inactive_day
                            ? `${formatDate(weekStats.most_inactive_day[0])} (${formatDuration(weekStats.most_inactive_day[1])})`
                            : "N/A"}
                    </div>
                </div>
            </div>

            {/* Categories Section */}
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
                <div className="space-y-2">
                    {stats.categories.map((cat, idx) => (
                        <div key={idx} className="space-y-1">
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
                                    {activeTab === "week" && cat.percentage_change !== null && (
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
                                        width: `${cat.percentage}%`,
                                        backgroundColor: cat.color || "#6b7280",
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Apps Section */}
            <div className="mb-6">
                <h2 className="text-xl font-bold mb-4">Top Apps</h2>
                <div className="space-y-2">
                    {stats.top_apps.map((app, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                            <span className="text-sm text-gray-200">{app.app}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-400">{formatDuration(app.total_duration)}</span>
                                {activeTab === "week" && app.percentage_change !== null && (
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

            {/* Category Breakdown by Day (Stacked Bar Chart) */}
            <div className="mb-6">
                <h2 className="text-xl font-bold mb-4">Category Breakdown by Day</h2>
                <div className="space-y-4">
                    {dayNames.map((dayName, dayIdx) => {
                        const dayData = dayCategoryMap.get(dayIdx);
                        if (!dayData || dayData.size === 0) {
                            return (
                                <div key={dayIdx} className="flex items-center gap-4">
                                    <div className="w-12 text-sm text-gray-400">{dayName}</div>
                                    <div className="flex-1 h-8 bg-gray-800 rounded"></div>
                                </div>
                            );
                        }

                        const dayTotal = Array.from(dayData.values()).reduce((sum, val) => sum + val, 0);
                        const categoryEntries = Array.from(dayData.entries())
                            .map(([cat, duration]) => {
                                const catInfo = weekStats.categories.find(c => c.category === cat);
                                return {cat, duration, color: catInfo?.color || "#6b7280"};
                            })
                            .sort((a, b) => b.duration - a.duration);

                        return (
                            <div key={dayIdx} className="flex items-center gap-4">
                                <div className="w-12 text-sm text-gray-400">{dayName}</div>
                                <div className="flex-1 h-8 bg-gray-800 rounded overflow-hidden flex">
                                    {categoryEntries.map(({cat, duration, color}, catIdx) => (
                                        <div
                                            key={catIdx}
                                            className="h-full"
                                            style={{
                                                width: `${(duration / dayTotal) * 100}%`,
                                                backgroundColor: color,
                                            }}
                                            title={`${cat}: ${formatDuration(duration)}`}
                                        />
                                    ))}
                                </div>
                                <div className="w-20 text-sm text-gray-400 text-right">{formatDuration(dayTotal)}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Hourly Activity Distribution */}
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
                            {/* Grid lines */}
                            {[6, 8, 10, 12, 14, 16, 18, 20].map(hour => (
                                <line
                                    key={hour}
                                    x1={((hour - 6) / 14) * 700 + 50}
                                    y1="10"
                                    x2={((hour - 6) / 14) * 700 + 50}
                                    y2="190"
                                    stroke="#374151"
                                    strokeWidth="1"
                                    strokeDasharray="2,2"
                                />
                            ))}
                            {/* Y-axis labels */}
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
                            {/* X-axis labels */}
                            {[6, 8, 10, 12, 14, 16, 18, 20].map(hour => (
                                <text
                                    key={hour}
                                    x={((hour - 6) / 14) * 700 + 50}
                                    y="200"
                                    fill="#9ca3af"
                                    fontSize="10"
                                    textAnchor="middle"
                                >
                                    {hour}:00
                                </text>
                            ))}
                            {/* Line chart */}
                            <path
                                d={`M ${stats.hourly_distribution
                                    .filter(h => h.hour >= 6 && h.hour <= 20)
                                    .map((h, idx) => {
                                        const x = ((h.hour - 6) / 14) * 700 + 50;
                                        const maxMinutes = Math.max(...stats.hourly_distribution.map(h => h.total_duration / 60), 1);
                                        const y = 190 - ((h.total_duration / 60) / maxMinutes) * 160;
                                        return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                                    })
                                    .join(' ')}`}
                                fill="none"
                                stroke="#f97316"
                                strokeWidth="2"
                            />
                            {/* Area under curve */}
                            <path
                                d={`M 50 190 ${stats.hourly_distribution
                                    .filter(h => h.hour >= 6 && h.hour <= 20)
                                    .map((h) => {
                                        const x = ((h.hour - 6) / 14) * 700 + 50;
                                        const maxMinutes = Math.max(...stats.hourly_distribution.map(h => h.total_duration / 60), 1);
                                        const y = 190 - ((h.total_duration / 60) / maxMinutes) * 160;
                                        return `L ${x} ${y}`;
                                    })
                                    .join(' ')} L ${((20 - 6) / 14) * 700 + 50} 190 Z`}
                                fill="url(#hourlyGradient)"
                            />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
}
