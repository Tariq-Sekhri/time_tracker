import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {get_week_statistics} from "../api/statistics.ts";
import { getWeekRange } from "../utils.ts";
import {useDateStore} from "../stores/dateStore.ts";
import { useSettingsStore } from "../stores/settingsStore.ts";
import { get_categories } from "../api/Category.ts";
import { get_cat_regex } from "../api/CategoryRegex.ts";
import { useAppCategorizeMenu } from "../hooks/useAppCategorizeMenu.tsx";
import { logRowLeftClickCalendarFilter } from "../utils/calendarAppFilterRowClick.ts";
import { useCalendarAppFilterActive } from "../stores/calendarAppFilterStore.ts";
import { exactAppRegexPattern } from "../utils/exactAppRegexPattern.ts";

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

export default function AppsList({onBack}: { onBack: () => void }) {
    const [visibleCount, setVisibleCount] = useState(100);
    const { openFromContextMenu, categorizeLayers } = useAppCategorizeMenu();
    const calendarAppFilterActive = useCalendarAppFilterActive();
    const { date } = useDateStore();
    const { uiMinAppDuration, calendarStartHour } = useSettingsStore();
    const {week_start, week_end} = getWeekRange(date, calendarStartHour);

    const {data: weekStats, isLoading} = useQuery({
        queryKey: ["week_statistics", week_start, week_end, calendarStartHour],
        queryFn: async () => await get_week_statistics(week_start, week_end),
    });
    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });
    const { data: catRegex = [] } = useQuery({
        queryKey: ["cat_regex"],
        queryFn: get_cat_regex,
    });

    if (isLoading || !weekStats) {
        return (
            <div className="p-6">
                <div className="text-gray-500">Loading apps...</div>
            </div>
        );
    }
    const allAppsForCalc = weekStats.all_apps || weekStats.top_apps;
    const filteredApps = allAppsForCalc.filter((app) => app.total_duration >= uiMinAppDuration);
    const calendarFiltered = calendarAppFilterActive
        ? filteredApps.filter((app) => app.app === calendarAppFilterActive)
        : filteredApps;
    const displayedApps = calendarFiltered.slice(0, visibleCount);
    const maxDuration = calendarFiltered.length > 0 ? calendarFiltered[0].total_duration : 1;
    const categoryByApp = new Map<string, string>();
    displayedApps.forEach(({ app }) => {
        const pattern = exactAppRegexPattern(app);
        const rule = catRegex.find((r) => r.regex === pattern);
        const catName = categories.find((c) => c.id === rule?.cat_id)?.name;
        categoryByApp.set(app, catName ?? "Miscellaneous");
    });


    return (
        <div className="p-6 text-white h-full overflow-y-auto nice-scrollbar">
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

            <div className="space-y-2">
                {displayedApps.map((app, idx) => {
                    const rank = idx + 1;
                    const category = categoryByApp.get(app.app) ?? "Miscellaneous";

                    return (
                        <div
                            key={idx}
                            onClick={(e) => logRowLeftClickCalendarFilter(e, app.app)}
                            onContextMenu={(e) => openFromContextMenu(e, app.app)}
                            className={`flex items-center gap-4 p-4 rounded cursor-pointer select-text ${
                                calendarAppFilterActive === app.app
                                    ? "bg-gray-800 ring-2 ring-blue-500 ring-inset"
                                    : "bg-gray-900 hover:bg-gray-800"
                            }`}
                        >
                            <div className="w-8 text-center text-gray-400 font-semibold">
                                {rank}
                            </div>

                            <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center">
                                <span className="text-xs text-gray-400">
                                    {app.app.substring(0, 2).toUpperCase()}
                                </span>
                            </div>

                            <div className="flex-1">
                                <div className="text-sm font-medium text-white">{app.app}</div>
                                <div className="text-xs text-gray-500">{category}</div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-sm text-gray-300">{formatDuration(app.total_duration)}</span>
                                {app.percentage_change !== null && (
                                    <span
                                        className={`text-xs ${app.percentage_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                                        {formatPercentage(app.percentage_change)}
                                    </span>
                                )}
                            </div>

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

            {displayedApps.length < filteredApps.length && (
                <div className="mt-6 text-center">
                    <button
                        onClick={() => setVisibleCount((c) => Math.min(c + 100, filteredApps.length))}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white"
                    >
                        Load 100 more
                    </button>
                </div>
            )}
            {categorizeLayers}
        </div>
    );
}
