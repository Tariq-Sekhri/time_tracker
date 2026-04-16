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
import { useToast } from "../Componants/Toast.tsx";
import { storageKey } from "../storageKey.ts";

const REGEX_VISIBLE_CATEGORY_IDS_KEY = storageKey("regex_visibleCategoryIds");
const REGEX_KNOWN_CATEGORY_IDS_KEY = storageKey("regex_knownCategoryIds");
const REGEX_SORT_ORDER_KEY = storageKey("regex_sortOrder");
const REGEX_GROUP_BY_CATEGORY_KEY = storageKey("regex_groupByCategory");
const REGEX_COLLAPSED_CATEGORY_IDS_KEY = storageKey("regex_collapsedCategoryIds");

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
    const { showToast } = useToast();
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
    const newRegexCatMenuRef = useRef<HTMLDivElement | null>(null);
    const sortMenuRef = useRef<HTMLDivElement | null>(null);
    const editCatMenuRef = useRef<HTMLDivElement | null>(null);
    const [newRegexCatMenuOpen, setNewRegexCatMenuOpen] = useState(false);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const [editCatMenuOpen, setEditCatMenuOpen] = useState(false);

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
            const savedVisibleRaw = localStorage.getItem(REGEX_VISIBLE_CATEGORY_IDS_KEY);
            const savedKnownRaw = localStorage.getItem(REGEX_KNOWN_CATEGORY_IDS_KEY);
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
                localStorage.setItem(REGEX_KNOWN_CATEGORY_IDS_KEY, JSON.stringify(allIds));
            } else {
                const allVisible = new Set<number>(allIds);
                setVisibleCategoryIds(allVisible);
                localStorage.setItem(REGEX_VISIBLE_CATEGORY_IDS_KEY, JSON.stringify([...allVisible]));
                localStorage.setItem(REGEX_KNOWN_CATEGORY_IDS_KEY, JSON.stringify(allIds));
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
            const rawSortOrder = localStorage.getItem(REGEX_SORT_ORDER_KEY);
            if (rawSortOrder === "oldest" || rawSortOrder === "newest") {
                setSortOrder(rawSortOrder);
            }

            const rawGroup = localStorage.getItem(REGEX_GROUP_BY_CATEGORY_KEY);
            if (rawGroup != null) {
                setGroupByCategory(rawGroup === "true");
            }

            const rawCollapsed = localStorage.getItem(REGEX_COLLAPSED_CATEGORY_IDS_KEY);
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
        if (!newRegexCatMenuOpen && !sortMenuOpen && !editCatMenuOpen) return;

        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            const inNew = newRegexCatMenuRef.current?.contains(target);
            const inSort = sortMenuRef.current?.contains(target);
            const inEdit = editCatMenuRef.current?.contains(target);
            if (!inNew && !inSort && !inEdit) {
                setNewRegexCatMenuOpen(false);
                setSortMenuOpen(false);
                setEditCatMenuOpen(false);
            }
        };

        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [newRegexCatMenuOpen, sortMenuOpen, editCatMenuOpen]);

    useEffect(() => {
        if (!hasInitializedVisibleCategories.current || categories.length === 0) {
            return;
        }
        try {
            localStorage.setItem(REGEX_VISIBLE_CATEGORY_IDS_KEY, JSON.stringify([...visibleCategoryIds]));
            localStorage.setItem(REGEX_KNOWN_CATEGORY_IDS_KEY, JSON.stringify(categories.map((c) => c.id)));
        } catch {
        }
    }, [visibleCategoryIds, categories]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        try {
            localStorage.setItem(REGEX_SORT_ORDER_KEY, sortOrder);
        } catch {
        }
    }, [sortOrder]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        try {
            localStorage.setItem(REGEX_GROUP_BY_CATEGORY_KEY, groupByCategory ? "true" : "false");
        } catch {
        }
    }, [groupByCategory]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        try {
            localStorage.setItem(REGEX_COLLAPSED_CATEGORY_IDS_KEY, JSON.stringify([...collapsedCategoryIds]));
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
            setNewRegexCatMenuOpen(false);
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
            setEditCatMenuOpen(false);
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
                        <div className="relative shrink-0 max-w-[14rem]" ref={editCatMenuRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditCatMenuOpen((v) => !v);
                                    setNewRegexCatMenuOpen(false);
                                    setSortMenuOpen(false);
                                    setIsCategoryFilterOpen(false);
                                }}
                                className="min-h-9 w-full min-w-[10rem] px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white hover:bg-gray-700 flex items-center justify-between gap-2 text-left"
                            >
                                <span className="truncate">
                                    {categories.find((c) => c.id === editingRegex.cat_id)?.name ?? "Category"}
                                </span>
                                <svg
                                    className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${editCatMenuOpen ? "rotate-180" : ""}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {editCatMenuOpen && (
                                <div className="absolute z-50 mt-2 left-0 w-64 max-h-[40vh] overflow-y-auto nice-scrollbar bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-2">
                                    {categories.map((cat) => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => {
                                                setEditingRegex({ ...editingRegex, cat_id: cat.id });
                                                setEditCatMenuOpen(false);
                                            }}
                                            className={`flex items-center gap-3 w-full p-2 rounded text-left hover:bg-gray-800 ${
                                                editingRegex.cat_id === cat.id ? "bg-gray-800" : ""
                                            }`}
                                        >
                                            {cat.color && (
                                                <div
                                                    className="w-4 h-4 rounded border border-gray-600 shrink-0"
                                                    style={{ backgroundColor: cat.color }}
                                                />
                                            )}
                                            <span className="text-sm text-gray-200 flex-1 truncate">{cat.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
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
                                setEditCatMenuOpen(false);
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
                                    onClick={() => {
                                        setEditCatMenuOpen(false);
                                        setEditingRegex(regex);
                                    }}
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
        <div className="p-6 text-white [color-scheme:dark]">
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
                    <div className="relative shrink-0 max-w-[14rem]" ref={newRegexCatMenuRef}>
                        <button
                            type="button"
                            onClick={() => {
                                setNewRegexCatMenuOpen((v) => !v);
                                setSortMenuOpen(false);
                                setEditCatMenuOpen(false);
                                setIsCategoryFilterOpen(false);
                            }}
                            className="min-h-9 w-full min-w-[10rem] max-w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white hover:bg-gray-700 flex items-center justify-between gap-2 text-left"
                        >
                            <span
                                className={`truncate ${newRegexCatId === "" ? "text-gray-400" : "text-white"}`}
                            >
                                {newRegexCatId === ""
                                    ? "Select category"
                                    : categories.find((c) => c.id === newRegexCatId)?.name ?? "Select category"}
                            </span>
                            <svg
                                className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${newRegexCatMenuOpen ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {newRegexCatMenuOpen && (
                            <div className="absolute z-50 mt-2 left-0 w-64 max-h-[40vh] overflow-y-auto nice-scrollbar bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-2">
                                {categories.map((cat) => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => {
                                            setNewRegexCatId(cat.id);
                                            setNewRegexCatMenuOpen(false);
                                        }}
                                        className={`flex items-center gap-3 w-full p-2 rounded text-left hover:bg-gray-800 ${
                                            newRegexCatId === cat.id ? "bg-gray-800" : ""
                                        }`}
                                    >
                                        {cat.color && (
                                            <div
                                                className="w-4 h-4 rounded border border-gray-600 shrink-0"
                                                style={{ backgroundColor: cat.color }}
                                            />
                                        )}
                                        <span className="text-sm text-gray-200 flex-1 truncate">{cat.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
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
                        onClick={() => {
                            setNewRegexCatMenuOpen(false);
                            setSortMenuOpen(false);
                            setEditCatMenuOpen(false);
                            setIsCategoryFilterOpen((v) => !v);
                        }}
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[50vh] overflow-auto nice-scrollbar pr-1">
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
                <div className="relative" ref={sortMenuRef}>
                    <button
                        type="button"
                        onClick={() => {
                            setSortMenuOpen((v) => !v);
                            setNewRegexCatMenuOpen(false);
                            setEditCatMenuOpen(false);
                            setIsCategoryFilterOpen(false);
                        }}
                        className="min-h-9 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white hover:bg-gray-700 flex items-center gap-2"
                    >
                        <span>{sortOrder === "newest" ? "Newest first" : "Oldest first"}</span>
                        <svg
                            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${sortMenuOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {sortMenuOpen && (
                        <div className="absolute z-50 mt-2 left-0 min-w-full w-max bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSortOrder("newest");
                                    setSortMenuOpen(false);
                                }}
                                className={`block w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-800 ${
                                    sortOrder === "newest" ? "bg-gray-800 text-gray-100" : "text-gray-200"
                                }`}
                            >
                                Newest first
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSortOrder("oldest");
                                    setSortMenuOpen(false);
                                }}
                                className={`block w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-800 ${
                                    sortOrder === "oldest" ? "bg-gray-800 text-gray-100" : "text-gray-200"
                                }`}
                            >
                                Oldest first
                            </button>
                        </div>
                    )}
                </div>
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

