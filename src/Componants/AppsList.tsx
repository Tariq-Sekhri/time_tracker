import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import {get_week_statistics, WeekStatistics} from "../api/statistics.ts";
import {unwrapResult, getWeekRange} from "../utils.ts";

type Tab = "week" | "dailyAvg" | "allTime";

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

interface AppsListProps {
    weekDate: Date;
    onBack: () => void;
}

export default function AppsList({weekDate, onBack}: AppsListProps) {
    const [activeTab, setActiveTab] = useState<Tab>("week");
    const [expanded, setExpanded] = useState(false);

    const {week_start, week_end} = getWeekRange(weekDate);

    const {data: weekStats, isLoading} = useQuery({
        queryKey: ["week_statistics", week_start, week_end],
        queryFn: async () => unwrapResult(await get_week_statistics(week_start, week_end)),
    });

    if (isLoading || !weekStats) {
        return (
            <div className="p-6">
                <div className="text-gray-500">Loading apps...</div>
            </div>
        );
    }

    // Get all apps from week stats
    const allApps = weekStats.all_apps || weekStats.top_apps;
    const displayedApps = expanded ? allApps : allApps.slice(0, 10);

    // Calculate daily average
    const allAppsForCalc = weekStats.all_apps || weekStats.top_apps;
    const dailyAvgApps = allAppsForCalc.map(app => ({
        ...app,
        total_duration: weekStats.number_of_active_days > 0
            ? Math.floor(app.total_duration / weekStats.number_of_active_days)
            : 0,
    }));

    const apps = activeTab === "week" ? allAppsForCalc : activeTab === "dailyAvg" ? dailyAvgApps : allAppsForCalc;
    const maxDuration = apps.length > 0 ? apps[0].total_duration : 1;

    // Get category for each app (simplified - would need to derive from logs)

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
                <h1 className="text-2xl font-bold">Apps List</h1>
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
                    onClick={() => setActiveTab("allTime")}
                    className={`px-4 py-2 font-medium ${activeTab === "allTime" ? "border-b-2 border-blue-500 text-white" : "text-gray-400"}`}
                >
                    All Time
                </button>
            </div>

            {/* Apps List */}
            <div className="space-y-2">
                {displayedApps.map((app, idx) => {
                    const rank = idx + 1;
                    const category = "Miscellaneous";

                    return (
                        <div key={idx} className="flex items-center gap-4 p-4 bg-gray-900 rounded hover:bg-gray-800">
                            {/* Rank */}
                            <div className="w-8 text-center text-gray-400 font-semibold">
                                {rank}
                            </div>

                            {/* App Icon Placeholder */}
                            <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center">
                                <span className="text-xs text-gray-400">
                                    {app.app.substring(0, 2).toUpperCase()}
                                </span>
                            </div>

                            {/* App Name and Category */}
                            <div className="flex-1">
                                <div className="text-sm font-medium text-white">{app.app}</div>
                                <div className="text-xs text-gray-500">{category}</div>
                            </div>

                            {/* Time and Percentage Change */}
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-gray-300">{formatDuration(app.total_duration)}</span>
                                {activeTab === "week" && app.percentage_change !== null && (
                                    <span
                                        className={`text-xs ${app.percentage_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                                        {formatPercentage(app.percentage_change)}
                                    </span>
                                )}
                            </div>

                            {/* Progress Bar */}
                            <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500"
                                    style={{
                                        width: `${(app.total_duration / maxDuration) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* See More Button */}
            {!expanded && allApps.length > 10 && (
                <div className="mt-6 text-center">
                    <button
                        onClick={() => setExpanded(true)}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white"
                    >
                        See more apps
                    </button>
                </div>
            )}
        </div>
    );
}
