import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { get_total_statistics, WeekStatistics } from "../api/statistics.ts";
import { get_logs_by_category, MergedLog } from "../api/Log.ts";
import { useSettingsStore } from "../stores/settingsStore.ts";
import { useAppCategorizeMenu } from "../hooks/useAppCategorizeMenu.tsx";
import { logRowLeftClickCalendarFilter } from "../utils/calendarAppFilterRowClick.ts";
import { useCalendarAppFilterActive } from "../stores/calendarAppFilterStore.ts";

type Tab = "dailyAvg" | "total";

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});
}

function formatCalendarSpanSinceFirstActiveDay(firstActiveDayUnix: number): string {
    const start = new Date(firstActiveDayUnix * 1000);
    const end = new Date();
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    if (days < 0) {
        months -= 1;
        days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    const parts: string[] = [];
    if (years > 0) {
        parts.push(`${years} year${years === 1 ? "" : "s"}`);
    }
    if (months > 0) {
        parts.push(`${months} month${months === 1 ? "" : "s"}`);
    }
    if (days > 0 || parts.length === 0) {
        parts.push(`${days} day${days === 1 ? "" : "s"}`);
    }
    return parts.join(" ");
}


export default function DetailedStatistics({ onBack }: { onBack: () => void }) {
    const [activeTab, setActiveTab] = useState<Tab>("dailyAvg");
    const [displayMode, setDisplayMode] = useState<"percentage" | "time" | "count">("time");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const { openFromContextMenu, categorizeLayers } = useAppCategorizeMenu({
        extraInvalidateQueryKeys: [["total_statistics"]],
    });
    const calendarAppFilterActive = useCalendarAppFilterActive();

    const uiMinAppDuration = useSettingsStore((state) => state.uiMinAppDuration);
    const minLogDuration = useSettingsStore((state) => state.timeBlockSettings.minLogDuration);

    const sidebarRef = useRef<HTMLDivElement | null>(null);
    const categoriesRef = useRef<HTMLDivElement | null>(null);

    const { data: totalStats, isLoading: isTotalLoading } = useQuery({
        queryKey: ["total_statistics"],
        queryFn: get_total_statistics,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const dailyAvgStats: WeekStatistics | null = useMemo(() => {
        if (!totalStats) return null;
        return {
            ...totalStats,
            total_time: totalStats.number_of_active_days > 0
                ? Math.floor(totalStats.total_time / totalStats.number_of_active_days)
                : 0,
            categories: totalStats.categories.map(cat => ({
                ...cat,
                total_duration: totalStats.number_of_active_days > 0
                    ? Math.floor(cat.total_duration / totalStats.number_of_active_days)
                    : 0,
            })),
            top_apps: totalStats.top_apps.map(app => ({
                ...app,
                total_duration: totalStats.number_of_active_days > 0
                    ? Math.floor(app.total_duration / totalStats.number_of_active_days)
                    : 0,
            })),
            all_apps: totalStats.all_apps.map(app => ({
                ...app,
                total_duration: totalStats.number_of_active_days > 0
                    ? Math.floor(app.total_duration / totalStats.number_of_active_days)
                    : 0,
            })),
            hourly_distribution: totalStats.number_of_active_days > 0
                ? totalStats.hourly_distribution.map(h => ({
                    ...h,
                    total_duration: Math.floor(h.total_duration / totalStats.number_of_active_days),
                }))
                : totalStats.hourly_distribution.map(h => ({
                    ...h,
                    total_duration: 0,
                })),
        };
    }, [totalStats]);

    const stats: WeekStatistics | null = activeTab === "dailyAvg" ? dailyAvgStats : (totalStats ?? null);

    const categoryStartTime = totalStats?.first_active_day ?? 0;
    const categoryQueryKey = selectedCategory
        ? ["category_app_logs", selectedCategory, categoryStartTime, minLogDuration]
        : ["category_app_logs", "none"];
    const { data: categoryAppLogs = [], isLoading: isLoadingCategory } = useQuery({
        queryKey: categoryQueryKey,
        enabled: !!selectedCategory,
        queryFn: async () => {
            if (!selectedCategory) return [];
            const result: MergedLog[] = await get_logs_by_category({
                category: selectedCategory,
                start_time: categoryStartTime,
                end_time: Math.floor(Date.now() / 1000),
                min_log_duration: minLogDuration,
            });
            const logMap = new Map<string, { app: string; totalDuration: number }>();
            result.forEach((log) => {
                const existing = logMap.get(log.app);
                if (existing) {
                    existing.totalDuration += log.duration;
                } else {
                    logMap.set(log.app, { app: log.app, totalDuration: log.duration });
                }
            });
            return Array.from(logMap.values()).sort((a, b) => b.totalDuration - a.totalDuration);
        },
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    useEffect(() => {
        if (!selectedCategory) return;

        const onDocumentMouseDown = (e: MouseEvent) => {
            const target = e.target as Node | null;
            if (!target) return;

            if (sidebarRef.current && sidebarRef.current.contains(target)) return;
            if (categoriesRef.current && categoriesRef.current.contains(target)) return;

            setSelectedCategory(null);
        };

        document.addEventListener("mousedown", onDocumentMouseDown);
        return () => {
            document.removeEventListener("mousedown", onDocumentMouseDown);
        };
    }, [selectedCategory]);

    const selectedCategoryStat = selectedCategory
        ? stats?.categories.find((c) => c.category === selectedCategory)
        : null;

    const numberOfActiveDays = totalStats?.number_of_active_days ?? 0;

    const scaledDuration = (seconds: number) => {
        if (activeTab !== "dailyAvg") return Math.floor(seconds);
        if (numberOfActiveDays <= 0) return 0;
        return Math.floor(seconds / numberOfActiveDays);
    };

    const scaledCategoryAppList = useMemo(
        () =>
            categoryAppLogs
                .map((a) => ({
                    ...a,
                    totalDuration: scaledDuration(a.totalDuration),
                }))
                .sort((a, b) => b.totalDuration - a.totalDuration),
        [categoryAppLogs, activeTab, numberOfActiveDays]
    );

    const selectedCategoryTotalDuration = selectedCategoryStat?.total_duration ?? 0;
    type DisplayApp = { app: string; totalDuration: number };

    const filteredScaledCategoryAppList = useMemo(
        () => scaledCategoryAppList.filter((a) => a.totalDuration >= uiMinAppDuration),
        [scaledCategoryAppList, uiMinAppDuration]
    );

    const sidebarApps: DisplayApp[] = useMemo(
        () =>
            selectedCategory
                ? filteredScaledCategoryAppList
                : (stats?.all_apps ?? [])
                    .filter((app) => app.total_duration >= uiMinAppDuration)
                    .map((app) => ({
                        app: app.app,
                        totalDuration: app.total_duration,
                    })),
        [selectedCategory, filteredScaledCategoryAppList, stats?.all_apps, uiMinAppDuration]
    );

    const sidebarAppsFiltered = sidebarApps;
    const sidebarMaxDuration = Math.max(...sidebarAppsFiltered.map((a) => a.totalDuration), 1);
    const sidebarPercentDenom = selectedCategory
        ? selectedCategoryTotalDuration
        : (stats?.total_time ?? 0);
    const hourlyPoints = useMemo(
        () => (stats?.hourly_distribution ?? []).filter((h) => h.hour >= 0 && h.hour <= 24),
        [stats?.hourly_distribution]
    );
    const maxHourlyMinutes = useMemo(
        () => Math.max(...hourlyPoints.map((h) => h.total_duration / 60), 1),
        [hourlyPoints]
    );
    const hourlyLinePath = useMemo(
        () =>
            hourlyPoints
                .map((h, idx) => {
                    const x = (h.hour / 24) * 700 + 50;
                    const y = 190 - ((h.total_duration / 60) / maxHourlyMinutes) * 160;
                    return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                })
                .join(" "),
        [hourlyPoints, maxHourlyMinutes]
    );
    const hourlyFillPath = useMemo(
        () =>
            `M 50 190 ${hourlyPoints
                .map((h) => {
                    const x = (h.hour / 24) * 700 + 50;
                    const y = 190 - ((h.total_duration / 60) / maxHourlyMinutes) * 160;
                    return `L ${x} ${y}`;
                })
                .join(" ")} L ${((24) / 24) * 700 + 50} 190 Z`,
        [hourlyPoints, maxHourlyMinutes]
    );

    if (!stats) {
        const loadingTab = activeTab === "dailyAvg" ? "Daily Avg" : "Total";
        return (
            <div className="p-6">
                <div className="text-gray-500">{isTotalLoading ? `Loading ${loadingTab} statistics...` : "No statistics available"}</div>
            </div>
        );
    }

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex-1 p-6 text-white h-full overflow-y-auto nice-scrollbar">
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

                <div className="flex gap-2 mb-6 border-b border-gray-700">
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

                {activeTab === "total" && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Total Time</div>
                            <div className="text-lg font-semibold">{formatDuration(totalStats!.total_time_all_time)}</div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">First Active Day</div>
                            <div className="text-lg font-semibold">
                                {totalStats!.first_active_day
                                    ? `${formatDate(totalStats!.first_active_day)} (${formatCalendarSpanSinceFirstActiveDay(totalStats!.first_active_day)})`
                                    : "N/A"}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "dailyAvg" && (
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Avg Time (Active Days)</div>
                            <div className="text-lg font-semibold">{formatDuration(totalStats!.average_time_active_days)}</div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Most Active Day</div>
                            <div className="text-lg font-semibold">
                                {totalStats!.most_active_day ? formatDate(totalStats!.most_active_day[0]) : "N/A"}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                                {totalStats!.most_active_day ? `(${formatDuration(totalStats!.most_active_day[1])})` : ""}
                            </div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded">
                            <div className="text-sm text-gray-400 mb-1">Most Inactive Day</div>
                            <div className="text-lg font-semibold">
                                {totalStats!.most_inactive_day ? formatDate(totalStats!.most_inactive_day[0]) : "N/A"}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                                {totalStats!.most_inactive_day ? `(${formatDuration(totalStats!.most_inactive_day[1])})` : ""}
                            </div>
                        </div>
                    </div>
                )}

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
                    <div ref={categoriesRef} className="space-y-2">
                        {stats.categories.map((cat) => (
                            <div
                                key={cat.category}
                                className={`space-y-1 rounded p-2 cursor-pointer transition-colors focus:outline-none ${selectedCategory === cat.category ? "bg-gray-800" : "hover:bg-gray-800/50"}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    setSelectedCategory((prev) => (prev === cat.category ? null : cat.category));
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setSelectedCategory((prev) => (prev === cat.category ? null : cat.category));
                                    }
                                }}
                            >
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

                {activeTab === "dailyAvg" && (
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
                                    {Array.from({length: 25}, (_, i) => i).map(hour => (
                                        <line
                                            key={hour}
                                            x1={(hour / 24) * 700 + 50}
                                            y1="10"
                                            x2={(hour / 24) * 700 + 50}
                                            y2="190"
                                            stroke="#374151"
                                            strokeWidth="1"
                                            strokeDasharray="2,2"
                                        />
                                    ))}
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
                                    {Array.from({length: 25}, (_, i) => i).map(hour => {
                                        const x = (hour / 24) * 700 + 50;
                                        return (
                                            <text
                                                key={hour}
                                                x={x}
                                                y="200"
                                                fill="#9ca3af"
                                                fontSize="9"
                                                textAnchor="end"
                                                transform={`rotate(-45 ${x} 200)`}
                                            >
                                                {hour}:00
                                            </text>
                                        );
                                    })}
                                    <path
                                        d={hourlyLinePath}
                                        fill="none"
                                        stroke="#f97316"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d={hourlyFillPath}
                                        fill="url(#hourlyGradient)"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div ref={sidebarRef} className="w-96 border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{backgroundColor: selectedCategoryStat?.color || "#6b7280"}}
                        />
                        <h2 className="text-xl font-bold">
                            {selectedCategory ? `Apps in ${selectedCategory}` : "Top Apps"}
                        </h2>
                    </div>
                    {selectedCategory && (
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            Close
                        </button>
                    )}
                </div>

                <div className="space-y-2 flex-1">
                    {selectedCategory && isLoadingCategory ? (
                        <div className="text-gray-500 text-sm">Loading app contributions...</div>
                    ) : sidebarAppsFiltered.length === 0 ? (
                        selectedCategory ? (
                                <div className="text-gray-500 text-sm">
                                    No apps recorded for this category (at least {formatDuration(uiMinAppDuration)}).
                                </div>
                        ) : (
                            <div className="text-gray-500 text-sm">No apps recorded.</div>
                        )
                    ) : (
                                    sidebarAppsFiltered.map((app) => {
                                        const barPct = (app.totalDuration / sidebarMaxDuration) * 100;
                                        const pct = sidebarPercentDenom > 0 ? (app.totalDuration / sidebarPercentDenom) * 100 : 0;
                            return (
                                            <div
                                                key={app.app}
                                                data-tt-app-context
                                                onClick={(e) => logRowLeftClickCalendarFilter(e, app.app)}
                                                onContextMenu={(e) => openFromContextMenu(e, app.app)}
                                                className={`rounded px-2 py-1 cursor-pointer select-text ${calendarAppFilterActive === app.app
                                                    ? "bg-gray-800 ring-1 ring-blue-500 ring-inset"
                                                    : "hover:bg-gray-900/80"
                                                    }`}
                                            >
                                    <div className="flex items-center justify-between mb-1 gap-3">
                                        <span className="text-sm text-gray-200 truncate flex-1">{app.app}</span>
                                        <span className="text-sm text-gray-400 flex-shrink-0">
                                            {displayMode === "percentage" ? `${pct.toFixed(1)}%` : formatDuration(app.totalDuration)}
                                        </span>
                                    </div>
                                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, barPct))}%` }} />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            {categorizeLayers}
        </div>
    );
}
