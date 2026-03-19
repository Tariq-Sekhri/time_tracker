import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { get_categories, Category } from "../api/Category.ts";
import {
    get_cat_regex,
    insert_cat_regex,
    update_cat_regex_by_id,
    delete_cat_regex_by_id,
    CategoryRegex,
    NewCategoryRegex
} from "../api/CategoryRegex.ts";
import { ToastContainer, useToast } from "../Componants/Toast.tsx";

function validateRegex(pattern: string): string | null {
    if (!pattern.trim()) {
        return "Pattern cannot be empty";
    }
    try {
        new RegExp(pattern);
        return null;
    } catch (e) {
        return `Invalid regex: ${e instanceof Error ? e.message : "Unknown error"}`;
    }
}

export default function CategoryRegexView() {
    const queryClient = useQueryClient();
    const { showToast, toasts, removeToast, updateToast } = useToast();
    const [editingRegex, setEditingRegex] = useState<CategoryRegex | null>(null);
    const [newRegexCatId, setNewRegexCatId] = useState<number | "">("");
    const [newRegexPattern, setNewRegexPattern] = useState("");
    const [regexError, setRegexError] = useState<string | null>(null);
    const [editRegexError, setEditRegexError] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("newest");
    const [groupByCategory, setGroupByCategory] = useState(false);
    const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<number>>(new Set());
    const [visibleCategoryIds, setVisibleCategoryIds] = useState<Set<number>>(new Set());
    const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
    const categoryFilterRef = useRef<HTMLDivElement | null>(null);

    const hasInitializedVisibleCategories = useRef(false);
    const hasInitializedUiPrefs = useRef(false);

    const toggleCategoryCollapsed = (catId: number) => {
        setCollapsedCategoryIds((prev) => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId);
            else next.add(catId);
            return next;
        });
    };

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });

    const { data: regexes = [] } = useQuery({
        queryKey: ["cat_regex"],
        queryFn: get_cat_regex,
    });

    const categoriesByPriority = useMemo(
        () => [...categories].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
        [categories]
    );

    useEffect(() => {
        if (categories.length === 0 || hasInitializedVisibleCategories.current) {
            return;
        }

        try {
            const savedVisibleRaw = localStorage.getItem("regex_visibleCategoryIds");
            const savedKnownRaw = localStorage.getItem("regex_knownCategoryIds");
            const allIds = categories.map((c) => c.id);

            if (savedVisibleRaw) {
                const savedVisible = new Set<number>(JSON.parse(savedVisibleRaw) as number[]);
                const savedKnown = savedKnownRaw ? new Set<number>(JSON.parse(savedKnownRaw) as number[]) : null;

                const merged = new Set<number>();
                for (const id of allIds) {
                    if (savedVisible.has(id)) {
                        merged.add(id);
                        continue;
                    }

                    if (savedKnown && savedKnown.has(id)) {
                        continue;
                    }

                    merged.add(id);
                }

                setVisibleCategoryIds(merged);
                localStorage.setItem("regex_knownCategoryIds", JSON.stringify(allIds));
            } else {
                const allVisible = new Set<number>(allIds);
                setVisibleCategoryIds(allVisible);
                localStorage.setItem("regex_visibleCategoryIds", JSON.stringify([...allVisible]));
                localStorage.setItem("regex_knownCategoryIds", JSON.stringify(allIds));
            }
        } catch {
            const allIds = categories.map((c) => c.id);
            setVisibleCategoryIds(new Set<number>(allIds));
        }

        hasInitializedVisibleCategories.current = true;
    }, [categories]);

    useEffect(() => {
        if (hasInitializedUiPrefs.current) {
            return;
        }

        try {
            const rawSortOrder = localStorage.getItem("regex_sortOrder");
            if (rawSortOrder === "oldest" || rawSortOrder === "newest") {
                setSortOrder(rawSortOrder);
            }

            const rawGroup = localStorage.getItem("regex_groupByCategory");
            if (rawGroup != null) {
                setGroupByCategory(rawGroup === "true");
            }

            const rawCollapsed = localStorage.getItem("regex_collapsedCategoryIds");
            if (rawCollapsed) {
                const ids = JSON.parse(rawCollapsed) as number[];
                setCollapsedCategoryIds(new Set<number>(ids));
            }
        } catch {
        }

        hasInitializedUiPrefs.current = true;
    }, []);

    useEffect(() => {
        if (!isCategoryFilterOpen) return;

        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            const container = categoryFilterRef.current;
            if (container && !container.contains(target)) {
                setIsCategoryFilterOpen(false);
            }
        };

        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [isCategoryFilterOpen]);

    useEffect(() => {
        if (!hasInitializedVisibleCategories.current || categories.length === 0) {
            return;
        }
        try {
            localStorage.setItem("regex_visibleCategoryIds", JSON.stringify([...visibleCategoryIds]));
            localStorage.setItem("regex_knownCategoryIds", JSON.stringify(categories.map((c) => c.id)));
        } catch {
        }
    }, [visibleCategoryIds, categories]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        try {
            localStorage.setItem("regex_sortOrder", sortOrder);
        } catch {
        }
    }, [sortOrder]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        try {
            localStorage.setItem("regex_groupByCategory", groupByCategory ? "true" : "false");
        } catch {
        }
    }, [groupByCategory]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        try {
            localStorage.setItem("regex_collapsedCategoryIds", JSON.stringify([...collapsedCategoryIds]));
        } catch {
        }
    }, [collapsedCategoryIds]);

    const filteredAndSortedRegexes = useMemo(() => {
        const visible = visibleCategoryIds;
        return [...regexes]
            .filter((r) => visible.has(r.cat_id))
            .sort((a, b) => (sortOrder === "oldest" ? a.id - b.id : b.id - a.id));
    }, [regexes, visibleCategoryIds, sortOrder]);

    const regexesByCategory = useMemo(() => {
        const map = new Map<number, typeof filteredAndSortedRegexes>();
        for (const r of filteredAndSortedRegexes) {
            const arr = map.get(r.cat_id) ?? [];
            arr.push(r);
            map.set(r.cat_id, arr);
        }
        return map;
    }, [filteredAndSortedRegexes]);

    const toggleVisibleCategory = (catId: number) => {
        setVisibleCategoryIds((prev) => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId);
            else next.add(catId);
            return next;
        });
    };

    const checkAllCategories = () => {
        setVisibleCategoryIds(new Set(categories.map((c) => c.id)));
    };

    const uncheckAllCategories = () => {
        setVisibleCategoryIds(new Set<number>());
    };

    const createRegexMutation = useMutation({
        mutationFn: async (newRegex: NewCategoryRegex) => {
            return await insert_cat_regex(newRegex);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            setNewRegexCatId("");
            setNewRegexPattern("");
            setRegexError(null);
            showToast("Regex pattern created successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to create regex:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to create regex pattern", "error", 5000, fullError);
        },
    });

    const updateRegexMutation = useMutation({
        mutationFn: async (regex: CategoryRegex) => {
            return await update_cat_regex_by_id(regex);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            setEditingRegex(null);
            setEditRegexError(null);
            showToast("Regex pattern updated successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to update regex:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to update regex pattern", "error", 5000, fullError);
        },
    });

    const deleteRegexMutation = useMutation({
        mutationFn: async (id: number) => {
            return await delete_cat_regex_by_id(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            showToast("Regex pattern deleted successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to delete regex:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to delete regex pattern", "error", 5000, fullError);
        },
    });

    const handleCreateRegex = () => {
        if (newRegexCatId === "" || typeof newRegexCatId !== "number") {
            showToast("Please select a category", "error");
            return;
        }

        const error = validateRegex(newRegexPattern);
        if (error) {
            setRegexError(error);
            const fullError = `Validation Error: ${error}\nPattern: ${newRegexPattern}`;
            showToast("Invalid regex pattern", "error", 5000, fullError);
            return;
        }
        setRegexError(null);

        if (typeof newRegexCatId === "number" && newRegexPattern.trim()) {
            createRegexMutation.mutate({
                cat_id: newRegexCatId,
                regex: newRegexPattern.trim(),
            });
        }
    };

    const handleUpdateRegex = (regex: CategoryRegex) => {
        if (!regex || !regex.id) {
            showToast("Invalid regex data", "error");
            return;
        }
        
        const error = validateRegex(regex.regex);
        if (error) {
            setEditRegexError(error);
            const fullError = `Validation Error: ${error}\nPattern: ${regex.regex}`;
            showToast("Invalid regex pattern", "error", 5000, fullError);
            return;
        }
        setEditRegexError(null);
        updateRegexMutation.mutate({
            id: regex.id,
            cat_id: regex.cat_id,
            regex: regex.regex.trim(),
        });
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
        queryClient.invalidateQueries({ queryKey: ["categories"] });
    };

    function renderRegexRow(regex: CategoryRegex, category: Category | undefined) {
        const isCatchAll = category?.name === "Miscellaneous" && regex.regex === ".*";
        return (
            <div key={regex.id} className="p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                {editingRegex?.id === regex.id && !isCatchAll ? (
                    <div className="flex gap-3 flex-1">
                        <select
                            value={editingRegex.cat_id}
                            onChange={(e) => setEditingRegex({ ...editingRegex, cat_id: parseInt(e.target.value) })}
                            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                        >
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                        <div className="flex-1 flex flex-col">
                            <input
                                type="text"
                                value={editingRegex.regex}
                                onChange={(e) => {
                                    setEditingRegex({ ...editingRegex, regex: e.target.value });
                                    setEditRegexError(null);
                                }}
                                className={`px-3 py-2 bg-gray-800 border rounded text-white ${editRegexError ? "border-red-500" : "border-gray-700"}`}
                            />
                            {editRegexError && (
                                <div className="mt-1 text-red-400 text-sm">{editRegexError}</div>
                            )}
                        </div>
                        <button
                            onClick={() => handleUpdateRegex(editingRegex)}
                            disabled={updateRegexMutation.isPending}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {updateRegexMutation.isPending ? "Saving..." : "Save"}
                        </button>
                        <button
                            onClick={() => {
                                setEditingRegex(null);
                                setEditRegexError(null);
                            }}
                            disabled={updateRegexMutation.isPending}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3">
                            {category?.color && (
                                <div
                                    className="w-6 h-6 rounded border border-gray-600"
                                    style={{ backgroundColor: category.color }}
                                />
                            )}
                            <div>
                                <span className="font-medium">{category?.name ?? `Category ${regex.cat_id}`}</span>
                                <span className="text-gray-400 ml-3 font-mono text-sm">{regex.regex}</span>
                                {isCatchAll && (
                                    <span className="ml-2 text-xs text-gray-500">(catch-all, cannot edit or delete)</span>
                                )}
                            </div>
                        </div>
                        {!isCatchAll && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEditingRegex(regex)}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => deleteRegexMutation.mutate(regex.id)}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="p-6 text-white">
            <ToastContainer toasts={toasts} onRemove={removeToast} onUpdate={updateToast} />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Category Regex Patterns</h1>
                <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            <div className="mb-4 p-4 bg-gray-900 rounded-lg">
                <h3 className="text-lg font-medium mb-3">Add New Regex</h3>
                <div className="flex gap-3">
                    <select
                        value={newRegexCatId === "" ? "" : newRegexCatId}
                        onChange={(e) => {
                            const value = e.target.value;
                            setNewRegexCatId(value ? parseInt(value, 10) : "");
                        }}
                        className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    >
                        <option value="">Select category</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                                {cat.name}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="Regex pattern"
                        value={newRegexPattern}
                        onChange={(e) => {
                            setNewRegexPattern(e.target.value);
                            setRegexError(null);
                        }}
                        className={`flex-1 px-3 py-2 bg-gray-800 border rounded text-white ${regexError ? 'border-red-500' : 'border-gray-700'}`}
                    />
                    <button
                        onClick={handleCreateRegex}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                    >
                        Add
                    </button>
                </div>
                {regexError && (
                    <div className="mt-2 text-red-400 text-sm">{regexError}</div>
                )}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative" ref={categoryFilterRef}>
                    <button
                        type="button"
                        onClick={() => setIsCategoryFilterOpen((v) => !v)}
                        className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white hover:bg-gray-700 flex items-center gap-2"
                    >
                        <span>
                            Filter categories ({visibleCategoryIds.size}/{categories.length || 0})
                        </span>
                        <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isCategoryFilterOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isCategoryFilterOpen && (
                        <div className="absolute z-50 mt-2 w-[min(700px,calc(100vw-3rem))] max-w-[700px] bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-3">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="text-sm font-medium text-gray-200">Categories</div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={checkAllCategories}
                                        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                                    >
                                        All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={uncheckAllCategories}
                                        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                                    >
                                        None
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[50vh] overflow-auto pr-1">
                                {categoriesByPriority.map((cat) => {
                                    const checked = visibleCategoryIds.has(cat.id);
                                    return (
                                        <label
                                            key={cat.id}
                                            className="flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleVisibleCategory(cat.id)}
                                                className="w-4 h-4 rounded cursor-pointer"
                                            />
                                            {cat.color && (
                                                <div
                                                    className="w-4 h-4 rounded border border-gray-600 shrink-0"
                                                    style={{ backgroundColor: cat.color }}
                                                />
                                            )}
                                            <span className="text-sm text-gray-200 flex-1">{cat.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <label className="text-gray-400 text-sm ml-2">Sort:</label>
                <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "oldest" | "newest")}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </select>
                <label className="flex items-center gap-2 cursor-pointer ml-2 select-none">
                    <input
                        type="checkbox"
                        checked={groupByCategory}
                        onChange={() => setGroupByCategory((prev) => !prev)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                    />
                    <span className="text-gray-400 text-sm">Group by category</span>
                </label>
            </div>

            <div className="space-y-2">
                {groupByCategory ? (
                    categoriesByPriority.map((cat) => {
                        const groupRegexes = regexesByCategory.get(cat.id) ?? [];
                        if (groupRegexes.length === 0) return null;
                        const isCollapsed = collapsedCategoryIds.has(cat.id);
                        return (
                            <div key={cat.id} className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => toggleCategoryCollapsed(cat.id)}
                                    className="flex items-center gap-2 w-full text-left py-2 px-3 rounded bg-gray-800/80 hover:bg-gray-800 text-sm font-medium transition-colors"
                                >
                                    <svg
                                        className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    {cat.color && (
                                        <div
                                            className="w-4 h-4 rounded border border-gray-600 shrink-0"
                                            style={{ backgroundColor: cat.color }}
                                        />
                                    )}
                                    <span>{cat.name}</span>
                                    <span className="text-gray-500 font-normal">({groupRegexes.length})</span>
                                </button>
                                {!isCollapsed && (
                                    <div className="pl-6 space-y-2">
                                        {groupRegexes.map((regex) => renderRegexRow(regex, cat))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    filteredAndSortedRegexes.map((regex) => {
                        const category = categories.find((c) => c.id === regex.cat_id);
                        return renderRegexRow(regex, category!);
                    })
                )}
            </div>
        </div>
    );
}

