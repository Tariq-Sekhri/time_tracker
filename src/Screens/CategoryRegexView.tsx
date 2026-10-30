import {useRegexNavigation} from "../stores/regexNavigationStore.ts";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {get_categories, Category, update_category_by_id} from "../api/Category.ts";
import {
    applyManualRules,
    CATEGORY_RULES_QUERY_KEY,
    CategoryRule,
    delete_cat_regex_by_id,
    get_category_rules,
    insert_category_rule,
    NewCategoryRule,
    update_category_rule,
} from "../api/CategoryRegex.ts";
import {getManualCategories, MANUAL_CATEGORIES_QUERY_KEY} from "../api/ManualProject.ts";
import {useToast} from "../Componants/Toast.tsx";
import {useAllCategories} from "../hooks/useAllCategories.ts";
import {getAppMetadata, setAppMetadata} from "../api/appMetadata.ts";
import FilterCategories, {useFilterCategories} from "../Componants/FilterCategories.tsx";
import RuleTargetPicker, {
    ruleTargetFields,
    ruleTargetLabel,
    ruleTargetOf,
    RuleTarget
} from "../Componants/RuleTargetPicker.tsx";
import {manualTimeQueryKeys} from "./Calander/manualCalendarEditing.ts";

const REGEX_SORT_ORDER_KEY = "time-tracker:cat-regex:sort-order";
const REGEX_GROUP_BY_CATEGORY_KEY = "time-tracker:cat-regex:group-by-category";
const RULE_TYPES = [
    {value: "all", label: "All"},
    {value: "auto", label: "Auto"},
    {value: "manual", label: "Manual"},
] as const;

const RULE_QUERY_KEYS = ["cat_regex", "week", "week_statistics", "week_app_filter", "day_statistics", "matchingCategoryRules"];

export default function CategoryRegexView() {
    const queryClient = useQueryClient();
    const requestedRuleId = useRegexNavigation((state) => state.targetId);
    const [focusedRuleId, setFocusedRuleId] = useState<number | null>(null);
    const focusedInputRef = useRef<HTMLInputElement>(null);
    const {showToast} = useToast();
    const [editingRegex, setEditingRegex] = useState<CategoryRule | null>(null);
    const [newRegexTarget, setNewRegexTarget] = useState<RuleTarget | null>(null);
    const [newRegexPattern, setNewRegexPattern] = useState("");
    const [regexError, setRegexError] = useState<string | null>(null);
    const [editRegexError, setEditRegexError] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("newest");
    const [groupByCategory, setGroupByCategory] = useState(false);
    const [ruleType, setRuleType] = useState<(typeof RULE_TYPES)[number]["value"]>("all");
    const [collapsedManualIds, setCollapsedManualIds] = useState<ReadonlySet<number>>(new Set());
    const sortMenuRef = useRef<HTMLDivElement | null>(null);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const [FilterOpen, setFilterOpen] = useState(false);
    const hasInitializedUiPrefs = useRef(false);

    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });

    const allCategories = useAllCategories();

    const {data: manualCategories = []} = useQuery({
        queryKey: MANUAL_CATEGORIES_QUERY_KEY,
        queryFn: getManualCategories,
    });

    const {data: regexes = [], isSuccess: regexesLoaded} = useQuery({
        queryKey: CATEGORY_RULES_QUERY_KEY,
        queryFn: get_category_rules,
    });

    const isCatchAll = (rule: CategoryRule) => {
        const category = allCategories.find((category) => category.id === rule.cat_id);
        return category?.name === "Miscellaneous" && category.parent_id == null && rule.regex === ".*";
    };

    useEffect(() => {
        if (requestedRuleId === null || !regexesLoaded || !allCategories.length) return;
        const rule = regexes.find((rule) => rule.id === requestedRuleId);
        if (rule) {
            setFocusedRuleId(rule.id);
            if (!isCatchAll(rule)) setEditingRegex({...rule});
        } else showToast("That regex no longer exists", "error");
        useRegexNavigation.getState().clear();
    }, [requestedRuleId, regexesLoaded, regexes, allCategories, showToast]);
    useEffect(() => {
        if (focusedRuleId === null) return;
        const frame = requestAnimationFrame(() => {
            const row = document.querySelector<HTMLElement>(`[data-regex-id="${focusedRuleId}"]`);
            row?.scrollIntoView({block: "center"});
            (focusedInputRef.current ?? row)?.focus({preventScroll: true});
        });
        return () => cancelAnimationFrame(frame);
    }, [focusedRuleId, editingRegex?.id, groupByCategory]);

    const {
        visibleCategoryIds,
        categoriesByPriority,
        toggleVisibleCategory,
        checkAllCategories,
        uncheckAllCategories,
    } = useFilterCategories(categories, "regex_enabled");

    /** The top-level category a rule groups and filters under. */
    const groupIdOf = useMemo(() => {
        const autoParents = new Map(allCategories.map((category) => [category.id, category.parent_id ?? category.id]));
        const manualParents = new Map(manualCategories.map((category) => [category.id, category.parent_id ?? category.id]));
        return (rule: CategoryRule) => rule.cat_id != null
            ? autoParents.get(rule.cat_id) ?? rule.cat_id
            : manualParents.get(rule.manual_project_id) ?? rule.manual_project_id!;
    }, [allCategories, manualCategories]);

    const filteredAndSortedRegexes = useMemo(() => {
        const visible = visibleCategoryIds;
        return regexes
            .filter((r) => r.id === focusedRuleId || (r.cat_id != null
                ? ruleType !== "manual" && visible.has(groupIdOf(r))
                : ruleType !== "auto"))
            .sort((a, b) => (sortOrder === "oldest" ? a.id - b.id : b.id - a.id));
    }, [regexes, visibleCategoryIds, sortOrder, focusedRuleId, ruleType, groupIdOf]);

    const regexesByCategory = useMemo(() => {
        const auto = new Map<number, CategoryRule[]>();
        const manual = new Map<number, CategoryRule[]>();
        for (const r of filteredAndSortedRegexes) {
            const map = r.cat_id != null ? auto : manual;
            const id = groupIdOf(r);
            map.set(id, [...(map.get(id) ?? []), r]);
        }
        return {auto, manual};
    }, [filteredAndSortedRegexes, groupIdOf]);

    useEffect(() => {
        if (hasInitializedUiPrefs.current) {
            return;
        }

        Promise.all([
            getAppMetadata(REGEX_SORT_ORDER_KEY),
            getAppMetadata(REGEX_GROUP_BY_CATEGORY_KEY),
        ])
            .then(([rawSortOrder, rawGroup]) => {
                if (rawSortOrder === "oldest" || rawSortOrder === "newest") {
                    setSortOrder(rawSortOrder);
                }
                if (rawGroup != null) {
                    setGroupByCategory(rawGroup === "true");
                }
            })
            .catch(() => {
            });

        hasInitializedUiPrefs.current = true;
    }, []);

    useEffect(() => {
        if (!sortMenuOpen) return;

        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (target && !sortMenuRef.current?.contains(target)) {
                setSortMenuOpen(false);
            }
        };

        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [sortMenuOpen]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        setAppMetadata(REGEX_SORT_ORDER_KEY, sortOrder).catch(() => {
        });
    }, [sortOrder]);

    useEffect(() => {
        if (!hasInitializedUiPrefs.current) {
            return;
        }
        setAppMetadata(REGEX_GROUP_BY_CATEGORY_KEY, groupByCategory ? "true" : "false").catch(() => {
        });
    }, [groupByCategory]);

    const updateCategoryCollapseMutation = useMutation({
        mutationFn: async (cat: Category) => {
            return await update_category_by_id(cat);
        },
        onMutate: async (cat) => {
            await queryClient.cancelQueries({queryKey: ["categories"]});
            const previous = queryClient.getQueryData<Category[]>(["categories"]);
            queryClient.setQueryData<Category[]>(["categories"], (old) =>
                old?.map((c) => (c.id === cat.id ? cat : c)) ?? []
            );
            return {previous};
        },
        onError: (_error, _cat, context) => {
            if (context?.previous) {
                queryClient.setQueryData(["categories"], context.previous);
            }
        },
    });

    const toggleCategoryCollapsed = (cat: Category) => {
        updateCategoryCollapseMutation.mutate({...cat, is_collapsed: !cat.is_collapsed});
    };

    const invalidateRuleQueries = () => {
        for (const key of RULE_QUERY_KEYS) {
            queryClient.invalidateQueries({queryKey: [key]});
        }
    };

    const createRegexMutation = useMutation({
        mutationFn: async (newRegex: NewCategoryRule) => {
            return await insert_category_rule(newRegex);
        },
        onSuccess: () => {
            invalidateRuleQueries();
            setNewRegexPattern("");
            setRegexError(null);
            showToast("Regex pattern created successfully", "success");
        },
        onError: (error: unknown) => {
            console.error("Failed to create regex:", error);
            setRegexError(String(error));
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to create regex pattern", "error", 5000, fullError);
        },
    });

    const updateRegexMutation = useMutation({
        mutationFn: async (regex: CategoryRule) => {
            return await update_category_rule(regex);
        },
        onSuccess: () => {
            invalidateRuleQueries();
            setEditingRegex(null);
            setEditRegexError(null);
            showToast("Regex pattern updated successfully", "success");
        },
        onError: (error: unknown) => {
            console.error("Failed to update regex:", error);
            setEditRegexError(String(error));
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to update regex pattern", "error", 5000, fullError);
        },
    });

    const deleteRegexMutation = useMutation({
        mutationFn: async (id: number) => {
            return await delete_cat_regex_by_id(id);
        },
        onSuccess: () => {
            invalidateRuleQueries();
            showToast("Regex pattern deleted successfully", "success");
        },
        onError: (error: unknown) => {
            console.error("Failed to delete regex:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to delete regex pattern", "error", 5000, fullError);
        },
    });

    const applyManualRulesMutation = useMutation({
        mutationFn: applyManualRules,
        onSuccess: (count) => {
            for (const key of manualTimeQueryKeys) {
                queryClient.invalidateQueries({queryKey: [key]});
            }
            showToast(count === 0 ? "No Uncategorized entries matched" : `Categorized ${count} ${count === 1 ? "entry" : "entries"}`, "success");
        },
        onError: (error: unknown) => {
            console.error("Failed to apply rules:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to apply rules", "error", 5000, fullError);
        },
    });

    const handleCreateRegex = () => {
        if (!newRegexTarget) {
            showToast("Please select a category", "error");
            return;
        }

        // Rust validates the saved pattern, including syntax such as (?i) that JS does not support.
        if (!newRegexPattern.trim()) {
            setRegexError("Pattern cannot be empty");
            return;
        }
        setRegexError(null);
        createRegexMutation.mutate({...ruleTargetFields(newRegexTarget), regex: newRegexPattern.trim()});
    };

    const handleUpdateRegex = (regex: CategoryRule) => {
        if (!regex.regex.trim()) {
            setEditRegexError("Pattern cannot be empty");
            return;
        }
        setEditRegexError(null);
        updateRegexMutation.mutate({...regex, regex: regex.regex.trim()});
    };

    function renderRegexRow(regex: CategoryRule) {
        const catchAll = isCatchAll(regex);
        const target = ruleTargetOf(regex);
        const color = regex.cat_id != null
            ? allCategories.find((c) => c.id === regex.cat_id)?.color
            : manualCategories.find((c) => c.id === regex.manual_project_id)?.color;
        return (
            <div key={regex.id} data-regex-id={regex.id} tabIndex={focusedRuleId === regex.id ? -1 : undefined} className={`p-4 bg-gray-900 rounded-lg flex items-center justify-between ${focusedRuleId === regex.id ? "ring-2 ring-sky-500" : ""}`}>
                {editingRegex?.id === regex.id && !catchAll ? (
                    <div className="flex gap-3 flex-1">
                        <RuleTargetPicker
                            target={ruleTargetOf(editingRegex)}
                            onChange={(next) => setEditingRegex({...editingRegex, ...ruleTargetFields(next)})}
                            autoCategories={allCategories}
                            manualCategories={manualCategories}
                            placeholder="Category"
                        />
                        <div className="flex-1 flex flex-col">
                            <input
                                ref={focusedRuleId === regex.id ? focusedInputRef : undefined}
                                aria-label="Regex pattern"
                                type="text"
                                value={editingRegex.regex}
                                onChange={(e) => {
                                    setEditingRegex({...editingRegex, regex: e.target.value});
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
                            {color && (
                                <div
                                    className="w-6 h-6 rounded border border-gray-600"
                                    style={{backgroundColor: color}}
                                />
                            )}
                            <div>
                                <span className="font-medium">{ruleTargetLabel(target, allCategories, manualCategories) ?? "Unknown category"}</span>
                                {regex.manual_project_id != null && (
                                    <span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">Manual</span>
                                )}
                                <span className="text-gray-400 ml-3 font-mono text-sm">{regex.regex}</span>
                                {catchAll && (
                                    <span
                                        className="ml-2 text-xs text-gray-500">(catch-all, cannot edit or delete)</span>
                                )}
                            </div>
                        </div>
                        {!catchAll && (
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

    function renderRegexGroup(key: string, name: ReactNode, color: string | null | undefined, rules: CategoryRule[], collapsed: boolean, onToggle: () => void) {
        const isCollapsed = collapsed && !rules.some((rule) => rule.id === focusedRuleId);
        return (
            <div key={key} className="space-y-2">
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex items-center gap-2 w-full text-left py-2 px-3 rounded bg-gray-800/80 hover:bg-gray-800 text-sm font-medium transition-colors"
                >
                    <svg
                        className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 5l7 7-7 7"/>
                    </svg>
                    {color && (
                        <div
                            className="w-4 h-4 rounded border border-gray-600 shrink-0"
                            style={{backgroundColor: color}}
                        />
                    )}
                    <span>{name}</span>
                    <span className="text-gray-500 font-normal">({rules.length})</span>
                </button>
                {!isCollapsed && (
                    <div className="pl-6 space-y-2">
                        {rules.map(renderRegexRow)}
                    </div>
                )}
            </div>
        );
    }

    const toggleManualCollapsed = (id: number) => {
        setCollapsedManualIds((previous) => {
            const next = new Set(previous);
            if (!next.delete(id)) next.add(id);
            return next;
        });
    };

    return (
        <div className="p-6 text-white [color-scheme:dark]">
            <div className="mb-4 p-4 bg-gray-900 rounded-lg">
                <h3 className="text-lg font-medium mb-3">Add New Regex</h3>
                <div className="flex gap-3">
                    <RuleTargetPicker
                        target={newRegexTarget}
                        onChange={setNewRegexTarget}
                        autoCategories={allCategories}
                        manualCategories={manualCategories}
                        placeholder="Select category"
                    />
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
                {newRegexTarget?.kind === "manual" && (
                    <div className="mt-2 text-gray-400 text-sm">Matches the title of Uncategorized manual entries when they are saved.</div>
                )}
                {regexError && (
                    <div className="mt-2 text-red-400 text-sm">{regexError}</div>
                )}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex rounded border border-gray-700 overflow-hidden" role="group" aria-label="Rule type">
                    {RULE_TYPES.map(({value, label}) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={ruleType === value}
                            onClick={() => setRuleType(value)}
                            className={`min-h-9 px-3 py-2 text-sm hover:bg-gray-700 ${ruleType === value ? "bg-gray-700 text-white" : "bg-gray-800 text-gray-300"}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <FilterCategories
                    enabledField="regex_enabled"
                    categories={categories}
                    categoriesByPriority={categoriesByPriority}
                    isOpen={FilterOpen}
                    setIsOpen={setFilterOpen}
                    onToggle={toggleVisibleCategory}
                    onCheckAll={checkAllCategories}
                    onUncheckAll={uncheckAllCategories}
                    onCloseOtherMenus={() => setSortMenuOpen(false)}
                />


                <label className="text-gray-400 text-sm ml-2">Sort:</label>
                <div className="relative" ref={sortMenuRef}>
                    <button
                        type="button"
                        onClick={() => {
                            setSortMenuOpen((v) => !v);
                            setFilterOpen(false);
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                    {sortMenuOpen && (
                        <div
                            className="absolute z-50 mt-2 left-0 min-w-full w-max bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-2">
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

                <button
                    type="button"
                    onClick={() => applyManualRulesMutation.mutate()}
                    disabled={applyManualRulesMutation.isPending || !regexes.some((rule) => rule.manual_project_id != null)}
                    title="Run manual rules over entries that have no category yet"
                    className="ml-auto min-h-9 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {applyManualRulesMutation.isPending ? "Applying..." : "Apply to Uncategorized entries"}
                </button>
            </div>

            <div className="space-y-2">
                {groupByCategory ? (
                    <>
                        {categories.map((cat) => {
                            const rules = regexesByCategory.auto.get(cat.id);
                            return rules && renderRegexGroup(`auto-${cat.id}`, cat.name, cat.color, rules, cat.is_collapsed, () => toggleCategoryCollapsed(cat));
                        })}
                        {manualCategories.map((cat) => {
                            const rules = cat.id == null ? undefined : regexesByCategory.manual.get(cat.id);
                            return rules && renderRegexGroup(
                                `manual-${cat.id}`,
                                <>{cat.name} <span className="text-gray-500 font-normal">Manual</span></>,
                                cat.color,
                                rules,
                                collapsedManualIds.has(cat.id!),
                                () => toggleManualCollapsed(cat.id!),
                            );
                        })}
                    </>
                ) : (
                    filteredAndSortedRegexes.map(renderRegexRow)
                )}
            </div>
        </div>
    );
}
