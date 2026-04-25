import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useToast } from "../Componants/Toast.tsx";
import { get_categories } from "../api/Category.ts";
import { get_cat_regex, insert_cat_regex, update_cat_regex_by_id } from "../api/CategoryRegex.ts";
import { count_matching_logs, insert_skipped_app_and_delete_logs } from "../api/SkippedApp.ts";
import { exactAppRegexPattern } from "../utils/exactAppRegexPattern.ts";
import { resolveCategoryRuleForApp } from "../utils/resolveCategoryRuleForApp.ts";

const ASSIGN_INVALIDATIONS: string[][] = [
    ["cat_regex"],
    ["week"],
    ["week_statistics"],
    ["day_statistics"],
];

const SKIP_INVALIDATIONS: string[][] = [
    ["skipped_apps"],
    ["week"],
    ["week_statistics"],
    ["day_statistics"],
];

function invalidateKeys(
    queryClient: ReturnType<typeof useQueryClient>,
    keys: readonly (readonly string[])[]
) {
    for (const k of keys) {
        queryClient.invalidateQueries({ queryKey: [...k] });
    }
}

export type UseAppCategorizeMenuOptions = {
    extraInvalidateQueryKeys?: readonly (readonly string[])[];
};

export function useAppCategorizeMenu(options?: UseAppCategorizeMenuOptions) {
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const menuRef = useRef<HTMLDivElement>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; appNames: string[] } | null>(null);
    const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
    const [skipPendingRegexes, setSkipPendingRegexes] = useState<string[]>([]);
    const [skipMatchingLogCount, setSkipMatchingLogCount] = useState(0);
    const [isCountingSkipLogs, setIsCountingSkipLogs] = useState(false);

    const extra = options?.extraInvalidateQueryKeys ?? [];

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });

    const { data: catRegexRows = [] } = useQuery({
        queryKey: ["cat_regex"],
        queryFn: get_cat_regex,
    });

    const menuRuleInfo = useMemo(() => {
        if (!menu) return null;
        if (menu.appNames.length !== 1) return null;
        return resolveCategoryRuleForApp(menu.appNames[0], categories, catRegexRows);
    }, [menu, categories, catRegexRows]);

    useEffect(() => {
        if (!menu) return;
        const close = (e: PointerEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            setMenu(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMenu(null);
        };
        document.addEventListener("pointerdown", close);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", onKey);
        };
    }, [menu]);

    const assignAppCategoryMutation = useMutation({
        mutationFn: async ({ catId, appNames }: { catId: number; appNames: string[] }) => {
            const catRegex = await queryClient.ensureQueryData({
                queryKey: ["cat_regex"],
                queryFn: get_cat_regex,
            });
            let didChange = false;
            const uniqueAppNames = Array.from(new Set(appNames));

            for (const appName of uniqueAppNames) {
                const pattern = exactAppRegexPattern(appName);
                const existing = catRegex.find((r) => r.regex === pattern);
                if (existing?.cat_id === catId) continue;
                if (existing) {
                    await update_cat_regex_by_id({ ...existing, cat_id: catId });
                } else {
                    await insert_cat_regex({ cat_id: catId, regex: pattern });
                }
                didChange = true;
            }
            return { didChange, appCount: uniqueAppNames.length };
        },
        onSuccess: ({ didChange, appCount }) => {
            setMenu(null);
            if (!didChange) return;
            invalidateKeys(queryClient, [...ASSIGN_INVALIDATIONS, ...extra]);
            showToast(appCount > 1 ? "Category rules saved" : "Category rule saved", "success");
        },
        onError: (e: unknown) => {
            console.error("Failed to save category rule:", e);
            const fullError = JSON.stringify(e, null, 2);
            showToast("Failed to save category rule", "error", 5000, fullError);
        },
    });

    const addSkipPatternMutation = useMutation({
        mutationFn: async (regexPatterns: string[]) => {
            for (const regex of regexPatterns) {
                await insert_skipped_app_and_delete_logs({ regex });
            }
            return regexPatterns.length;
        },
        onSuccess: () => {
            invalidateKeys(queryClient, [...SKIP_INVALIDATIONS, ...extra]);
            setMenu(null);
            setSkipConfirmOpen(false);
            setSkipPendingRegexes([]);
            showToast("Added to skipped apps", "success");
        },
        onError: (e: unknown) => {
            console.error("Failed to add skipped app:", e);
            const fullError = JSON.stringify(e, null, 2);
            showToast("Failed to add skipped app", "error", 5000, fullError);
        },
    });

    const handleAddToSkippedApps = async () => {
        if (!menu) return;
        const appNames = Array.from(new Set(menu.appNames));
        const regexPatterns = appNames.map((appName) => exactAppRegexPattern(appName));
        setIsCountingSkipLogs(true);
        try {
            const counts = await Promise.all(regexPatterns.map((regex) => count_matching_logs(regex)));
            const count = counts.reduce((sum, n) => sum + n, 0);
            setSkipMatchingLogCount(count);
            setSkipPendingRegexes(regexPatterns);
            setSkipConfirmOpen(true);
        } catch (e: unknown) {
            console.error("Failed to count matching logs for skip:", e);
            const fullError = JSON.stringify(e, null, 2);
            showToast("Failed to add skipped app", "error", 5000, fullError);
        } finally {
            setIsCountingSkipLogs(false);
        }
    };

    const openFromContextMenu = (e: ReactMouseEvent | globalThis.MouseEvent, appName: string) => {
        openFromContextMenuMany(e, [appName]);
    };

    const openFromContextMenuMany = (e: ReactMouseEvent | globalThis.MouseEvent, appNames: string[]) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY, appNames });
    };

    const sortedCategories = useMemo(
        () => [...categories].sort((a, b) => b.priority - a.priority),
        [categories]
    );

    const isBatchMenu = (menu?.appNames.length ?? 0) > 1;

    const categorizeLayers = (
        <>
            {menu && (
                <div
                    ref={menuRef}
                    className="fixed z-[200] min-w-[12rem] max-h-64 overflow-y-auto nice-scrollbar rounded-lg border border-gray-600 bg-gray-900 py-1 shadow-xl"
                    style={{ left: menu.x, top: menu.y }}
                    role="menu"
                >
                    <div
                        className="px-3 py-2 text-xs border-b border-gray-700 space-y-1 max-w-[min(24rem,calc(100vw-2rem))]"
                        title={isBatchMenu ? `${menu.appNames.length} apps` : menu.appNames[0]}
                    >
                        <div className="text-gray-300 font-mono break-all leading-snug">
                            {isBatchMenu ? `${menu.appNames.length} apps selected` : (menuRuleInfo?.matchedRegex ?? "No rule matched")}
                        </div>
                        <div className="text-gray-400 break-words leading-snug">
                            category: {isBatchMenu ? "Assign all selected apps" : (menuRuleInfo?.categoryName ?? "—")}
                        </div>
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
                                    appNames: menu.appNames,
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
                        {isCountingSkipLogs
                            ? "Checking..."
                            : (isBatchMenu ? `Add ${menu.appNames.length} apps to skipped apps` : "Add to skipped apps")}
                    </button>
                </div>
            )}

            {skipConfirmOpen && skipPendingRegexes.length > 0 && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[250]">
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
                                type="button"
                                onClick={() => {
                                    setSkipConfirmOpen(false);
                                    setSkipPendingRegexes([]);
                                }}
                                disabled={addSkipPatternMutation.isPending}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => addSkipPatternMutation.mutate(skipPendingRegexes)}
                                disabled={addSkipPatternMutation.isPending}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
                            >
                                {addSkipPatternMutation.isPending
                                    ? "Adding..."
                                    : "Delete Logs & Add Pattern"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    return { openFromContextMenu, openFromContextMenuMany, categorizeLayers };
}
