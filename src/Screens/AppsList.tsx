import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {get_week_statistics} from "../api/statistics.ts";
import { getWeekRange } from "../utils.ts";
import {useDateStore} from "../stores/dateStore.ts";
import { useSettingsStore } from "../stores/settingsStore.ts";
import { get_categories } from "../api/Category.ts";
import { get_cat_regex, insert_cat_regex, update_cat_regex_by_id } from "../api/CategoryRegex.ts";
import { count_matching_logs, insert_skipped_app_and_delete_logs } from "../api/SkippedApp.ts";
import { useToast } from "../Componants/Toast.tsx";

type Tab = "week" | "dailyAvg" | "allTime";

function exactAppRegexPattern(appName: string): string {
    const escaped = appName.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    return `^${escaped}$`;
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

export default function AppsList({onBack}: { onBack: () => void }) {
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<Tab>("week");
    const [visibleCount, setVisibleCount] = useState(20);
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
            showToast("Category rule saved", "success");
        },
        onError: (e: unknown) => {
            console.error("Failed to save category rule:", e);
            showToast("Failed to save category rule", "error");
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
            setCategorizeMenu(null);
            setSkipConfirmOpen(false);
            setSkipPendingRegex(null);
            showToast("Added to skipped apps", "success");
        },
        onError: (e: unknown) => {
            console.error("Failed to add skipped app:", e);
            showToast("Failed to add skipped app", "error");
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
            showToast("Failed to add skipped app", "error");
        } finally {
            setIsCountingSkipLogs(false);
        }
    };

    if (isLoading || !weekStats) {
        return (
            <div className="p-6">
                <div className="text-gray-500">Loading apps...</div>
            </div>
        );
    }
    const allAppsForCalc = weekStats.all_apps || weekStats.top_apps;
    const dailyAvgApps = allAppsForCalc.map(app => ({
        ...app,
        total_duration: weekStats.number_of_active_days > 0
            ? Math.floor(app.total_duration / weekStats.number_of_active_days)
            : 0,
    }));

    const apps = activeTab === "week" ? allAppsForCalc : activeTab === "dailyAvg" ? dailyAvgApps : allAppsForCalc;
    const filteredApps = apps.filter((app) => app.total_duration >= uiMinAppDuration);
    const displayedApps = filteredApps.slice(0, visibleCount);
    const maxDuration = filteredApps.length > 0 ? filteredApps[0].total_duration : 1;
    const sortedCategories = [...categories].sort((a, b) => b.priority - a.priority);
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

            <div className="flex gap-2 mb-6 border-b border-gray-700">
                <button
                    onClick={() => {
                        setActiveTab("week");
                        setVisibleCount(20);
                    }}
                    className={`px-4 py-2 font-medium ${activeTab === "week" ? "border-b-2 border-blue-500 text-white" : "text-gray-400"}`}
                >
                    Week
                </button>
                <button
                    onClick={() => {
                        setActiveTab("dailyAvg");
                        setVisibleCount(20);
                    }}
                    className={`px-4 py-2 font-medium ${activeTab === "dailyAvg" ? "border-b-2 border-blue-500 text-white" : "text-gray-400"}`}
                >
                    Daily Avg
                </button>
                <button
                    onClick={() => {
                        setActiveTab("allTime");
                        setVisibleCount(20);
                    }}
                    className={`px-4 py-2 font-medium ${activeTab === "allTime" ? "border-b-2 border-blue-500 text-white" : "text-gray-400"}`}
                >
                    All Time
                </button>
            </div>

            <div className="space-y-2">
                {displayedApps.map((app, idx) => {
                    const rank = idx + 1;
                    const category = categoryByApp.get(app.app) ?? "Miscellaneous";

                    return (
                        <div
                            key={idx}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCategorizeMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    appName: app.app,
                                });
                            }}
                            className="flex items-center gap-4 p-4 bg-gray-900 rounded hover:bg-gray-800"
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
                                {activeTab === "week" && app.percentage_change !== null && (
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
                        onClick={() => setVisibleCount((c) => Math.min(c + 20, filteredApps.length))}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white"
                    >
                        Load 20 more
                    </button>
                </div>
            )}
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
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
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
