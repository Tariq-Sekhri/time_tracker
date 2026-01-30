import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
    get_categories,
    insert_category,
    update_category_by_id,
    delete_category_by_id,
    Category,
    NewCategory
} from "../api/Category.ts";
import {
    get_cat_regex,
    insert_cat_regex,
    update_cat_regex_by_id,
    delete_cat_regex_by_id,
    CategoryRegex,
    NewCategoryRegex
} from "../api/CategoryRegex.ts";
import {
    get_skipped_apps,
    insert_skipped_app,
    delete_skipped_app_by_id,
    SkippedApp,
    NewSkippedApp
} from "../api/SkippedApp.ts";
import { unwrapResult } from "../utils.ts";
import { ToastContainer, useToast } from "./Toast.tsx";

export default function CategoriesManagement() {
    const queryClient = useQueryClient();
    const { showToast, toasts, removeToast, updateToast } = useToast();
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [editingRegex, setEditingRegex] = useState<CategoryRegex | null>(null);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryPriority, setNewCategoryPriority] = useState(0);
    const [newCategoryColor, setNewCategoryColor] = useState("#000000");
    const [newRegexCatId, setNewRegexCatId] = useState<number | "">("");
    const [newRegexPattern, setNewRegexPattern] = useState("");
    const [newSkippedAppName, setNewSkippedAppName] = useState("");
    const [editRegexError, setEditRegexError] = useState<string | null>(null);

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: async () => unwrapResult(await get_categories()),
    });

    const { data: regexes = [] } = useQuery({
        queryKey: ["cat_regex"],
        queryFn: async () => unwrapResult(await get_cat_regex()),
    });

    const { data: skippedApps = [] } = useQuery({
        queryKey: ["skipped_apps"],
        queryFn: async () => unwrapResult(await get_skipped_apps()),
    });

    const createCategoryMutation = useMutation({
        mutationFn: async (newCat: NewCategory) => {
            return unwrapResult(await insert_category(newCat));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            setNewCategoryName("");
            setNewCategoryPriority(0);
            setNewCategoryColor("#000000");
            showToast("Category created successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to create category:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to create category", "error", 5000, fullError);
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: async (cat: Category) => {
            return unwrapResult(await update_category_by_id(cat));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            setEditingCategory(null);
            showToast("Category updated successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to update category:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to update category", "error", 5000, fullError);
        },
    });

    const [showCascadeDeleteConfirm, setShowCascadeDeleteConfirm] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);
    const [cascadeDelete, setCascadeDelete] = useState(true);
    const [regexCount, setRegexCount] = useState(0);

    const deleteCategoryMutation = useMutation({
        mutationFn: async ({ id, cascade }: { id: number; cascade: boolean }) => {
            return unwrapResult(await delete_category_by_id(id, cascade));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            setShowCascadeDeleteConfirm(false);
            setCategoryToDelete(null);
            setCascadeDelete(true);
            showToast("Category deleted successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to delete category:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to delete category", "error", 5000, fullError);
        },
    });

    const handleDeleteCategoryClick = (id: number) => {
        setCategoryToDelete(id);
        setCascadeDelete(true); // Default to cascade delete

        const count = regexes.filter(regex => regex.cat_id === id).length;
        setRegexCount(count);

        setShowCascadeDeleteConfirm(true);
    };

    const handleConfirmDeleteCategory = (cascade: boolean) => {
        if (categoryToDelete !== null) {
            deleteCategoryMutation.mutate({ id: categoryToDelete, cascade });
        }
    };

    const createRegexMutation = useMutation({
        mutationFn: async (newRegex: NewCategoryRegex) => {
            return unwrapResult(await insert_cat_regex(newRegex));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            setNewRegexCatId("");
            setNewRegexPattern("");
            showToast("Regex pattern created successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to create regex:", error);
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to create regex pattern", "error", 5000, fullError);
        },
    });

    const updateRegexMutation = useMutation({
        mutationFn: async (regex: CategoryRegex) => {
            return unwrapResult(await update_cat_regex_by_id(regex));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            setEditingRegex(null);
            setEditRegexError(null);
            showToast("Regex pattern updated successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to update regex:", error);
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to update regex pattern", "error", 5000, fullError);
        },
    });

    const deleteRegexMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_cat_regex_by_id(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
        },
    });

    const createSkippedAppMutation = useMutation({
        mutationFn: async (newApp: NewSkippedApp) => {
            return unwrapResult(await insert_skipped_app(newApp));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
            setNewSkippedAppName("");
            showToast("Skipped app pattern created successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to create skipped app:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to create skipped app pattern", "error", 5000, fullError);
        },
    });

    const deleteSkippedAppMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_skipped_app_by_id(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
            showToast("Skipped app pattern deleted successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to delete skipped app:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to delete skipped app pattern", "error", 5000, fullError);
        },
    });

    const handleCreateCategory = () => {
        if (!newCategoryName.trim()) {
            showToast("Category name cannot be empty", "error");
            return;
        }

        createCategoryMutation.mutate({
            name: newCategoryName.trim(),
            priority: newCategoryPriority,
            color: newCategoryColor || null,
        });
    };

    const handleUpdateCategory = (cat: Category) => {
        updateCategoryMutation.mutate(cat);
    };

    const validateRegex = (pattern: string): string | null => {
        if (!pattern.trim()) {
            return "Pattern cannot be empty";
        }
        try {
            new RegExp(pattern);
            return null;
        } catch (e) {
            return `Invalid regex: ${e instanceof Error ? e.message : "Unknown error"}`;
        }
    };

    const handleCreateRegex = () => {
        if (newRegexCatId === "" || typeof newRegexCatId !== "number") {
            showToast("Please select a category", "error");
            return;
        }

        const regexError = validateRegex(newRegexPattern);
        if (regexError) {
            const fullError = `Validation Error: ${regexError}\nPattern: ${newRegexPattern}`;
            showToast("Invalid regex pattern", "error", 5000, fullError);
            return;
        }

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

        const regexError = validateRegex(regex.regex);
        if (regexError) {
            setEditRegexError(regexError);
            const fullError = `Validation Error: ${regexError}\nPattern: ${regex.regex}`;
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

    const handleCreateSkippedApp = () => {
        if (newSkippedAppName.trim()) {
            createSkippedAppMutation.mutate({
                regex: newSkippedAppName.trim(),
            });
        }
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ["categories"] });
        queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
        queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
    };

    return (
        <div className="p-6 text-white">
            <ToastContainer toasts={toasts} onRemove={removeToast} onUpdate={updateToast} />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Categories & Regex Management</h1>
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

            <div className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">Categories</h2>

                <div className="mb-4 p-4 bg-gray-900 rounded-lg">
                    <h3 className="text-lg font-medium mb-3">Add New Category</h3>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="Category name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                        />
                        <input
                            type="number"
                            placeholder="Priority"
                            value={newCategoryPriority}
                            onChange={(e) => setNewCategoryPriority(parseInt(e.target.value) || 0)}
                            className="w-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                        />
                        <input
                            type="color"
                            value={newCategoryColor}
                            onChange={(e) => setNewCategoryColor(e.target.value)}
                            className="w-16 h-10 bg-gray-800 border border-gray-700 rounded cursor-pointer"
                        />
                        <button
                            onClick={handleCreateCategory}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                        >
                            Add
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    {categories.map((cat) => {
                        const isMiscellaneous = cat.name === "Miscellaneous";
                        return (
                            <div key={cat.id} className="p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                                {editingCategory?.id === cat.id ? (
                                    <div className="flex gap-3 flex-1">
                                        <input
                                            type="text"
                                            value={editingCategory.name}
                                            onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                                        />
                                        {!isMiscellaneous && (
                                            <input
                                                type="number"
                                                value={editingCategory.priority}
                                                onChange={(e) => setEditingCategory({ ...editingCategory, priority: parseInt(e.target.value) || 0 })}
                                                className="w-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                                            />
                                        )}
                                        <input
                                            type="color"
                                            value={editingCategory.color || "#000000"}
                                            onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                                            className="w-16 h-10 bg-gray-800 border border-gray-700 rounded cursor-pointer"
                                        />
                                        <button
                                            onClick={() => handleUpdateCategory(isMiscellaneous ? { ...editingCategory, priority: 0 } : editingCategory)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() => setEditingCategory(null)}
                                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-6 h-6 rounded border border-gray-600"
                                                style={{ backgroundColor: cat.color || "#000000" }}
                                            />
                                            <div>
                                                <span className="font-medium">{cat.name}</span>
                                                {!isMiscellaneous && (
                                                    <span className="text-gray-400 ml-3">Priority: {cat.priority}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setEditingCategory(cat)}
                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                                            >
                                                Edit
                                            </button>
                                            {!isMiscellaneous && (
                                                <button
                                                    onClick={() => handleDeleteCategoryClick(cat.id)}
                                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-semibold mb-4">Category Regex Patterns</h2>

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
                            onChange={(e) => setNewRegexPattern(e.target.value)}
                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                        />
                        <button
                            onClick={handleCreateRegex}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                        >
                            Add
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    {regexes.map((regex) => {
                        const category = categories.find((c) => c.id === regex.cat_id);
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
                                                className={`px-3 py-2 bg-gray-800 border rounded text-white ${editRegexError ? 'border-red-500' : 'border-gray-700'}`}
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
                                                <span className="font-medium">{category?.name || `Category ${regex.cat_id}`}</span>
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
                    })}
                </div>
            </div>

            <div className="mt-8">
                <h2 className="text-2xl font-semibold mb-4">Skipped Apps</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Apps matching these regex patterns will not be tracked. Use the Skipped Apps tab for a better experience with confirmation dialogs.
                </p>

                <div className="mb-4 p-4 bg-gray-900 rounded-lg">
                    <h3 className="text-lg font-medium mb-3">Add Skipped App Pattern</h3>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="Regex pattern (e.g., ^Chrome$ or .*Discord.*)"
                            value={newSkippedAppName}
                            onChange={(e) => setNewSkippedAppName(e.target.value)}
                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                        />
                        <button
                            onClick={handleCreateSkippedApp}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                        >
                            Add
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    {skippedApps.map((app) => (
                        <div key={app.id} className="p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                            <div>
                                <code className="font-medium text-gray-200 bg-gray-800 px-2 py-1 rounded">{app.regex || "(empty)"}</code>
                            </div>
                            <button
                                onClick={() => deleteSkippedAppMutation.mutate(app.id)}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                            >
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {showCascadeDeleteConfirm && categoryToDelete !== null && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white">Delete Category</h3>
                        {(() => {
                            const category = categories.find(c => c.id === categoryToDelete);
                            return (
                                <>
                                    <p className="text-gray-300 mb-2">
                                        You are about to delete <span className="font-semibold text-white">{category?.name || "this category"}</span>.
                                    </p>
                                    {regexCount > 0 ? (
                                        <p className="text-yellow-400 mb-4 text-sm">
                                            This category has <span className="font-semibold">{regexCount} regex pattern{regexCount !== 1 ? 's' : ''}</span> associated with it.
                                        </p>
                                    ) : (
                                        <p className="text-gray-400 mb-4 text-sm">
                                            This category has no regex patterns associated with it.
                                        </p>
                                    )}
                                    <p className="text-gray-300 mb-4">
                                        How would you like to proceed?
                                    </p>
                                </>
                            );
                        })()}
                        <div className="space-y-3 mb-4">
                            <div className="p-3 bg-gray-800 rounded border border-gray-700">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="deleteType"
                                        value="cascade"
                                        checked={cascadeDelete}
                                        onChange={() => setCascadeDelete(true)}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-medium text-white">Cascade Delete</div>
                                        <div className="text-sm text-gray-400">
                                            Delete the category{regexCount > 0 && ` and all ${regexCount} associated regex pattern${regexCount !== 1 ? 's' : ''}`}
                                        </div>
                                    </div>
                                </label>
                            </div>
                            <div className="p-3 bg-gray-800 rounded border border-gray-700">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="deleteType"
                                        value="simple"
                                        checked={!cascadeDelete}
                                        onChange={() => setCascadeDelete(false)}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-medium text-white">Simple Delete</div>
                                        <div className="text-sm text-gray-400">
                                            Delete only the category{regexCount > 0 && ` (${regexCount} regex pattern${regexCount !== 1 ? 's will' : ' will'} remain orphaned)`}
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowCascadeDeleteConfirm(false);
                                    setCategoryToDelete(null);
                                }}
                                disabled={deleteCategoryMutation.isPending}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleConfirmDeleteCategory(cascadeDelete)}
                                disabled={deleteCategoryMutation.isPending}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
                            >
                                {deleteCategoryMutation.isPending ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

