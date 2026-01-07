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

export default function CategoriesManagement() {
    const queryClient = useQueryClient();
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [editingRegex, setEditingRegex] = useState<CategoryRegex | null>(null);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryPriority, setNewCategoryPriority] = useState(0);
    const [newCategoryColor, setNewCategoryColor] = useState("#000000");
    const [newRegexCatId, setNewRegexCatId] = useState<number | "">("");
    const [newRegexPattern, setNewRegexPattern] = useState("");
    const [newSkippedAppName, setNewSkippedAppName] = useState("");

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
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: async (cat: Category) => {
            return unwrapResult(await update_category_by_id(cat));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            setEditingCategory(null);
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_category_by_id(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
        },
    });

    const createRegexMutation = useMutation({
        mutationFn: async (newRegex: NewCategoryRegex) => {
            return unwrapResult(await insert_cat_regex(newRegex));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            setNewRegexCatId("");
            setNewRegexPattern("");
        },
        onError: (error) => {
            console.error("Failed to create regex:", error);
            alert(`Failed to create regex: ${error}`);
        },
    });

    const updateRegexMutation = useMutation({
        mutationFn: async (regex: CategoryRegex) => {
            return unwrapResult(await update_cat_regex_by_id(regex));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
            setEditingRegex(null);
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
        },
    });

    const deleteSkippedAppMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_skipped_app_by_id(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
        },
    });

    const handleCreateCategory = () => {
        if (newCategoryName.trim()) {
            createCategoryMutation.mutate({
                name: newCategoryName.trim(),
                priority: newCategoryPriority,
                color: newCategoryColor || null,
            });
        }
    };

    const handleUpdateCategory = (cat: Category) => {
        updateCategoryMutation.mutate(cat);
    };

    const handleCreateRegex = () => {
        if (typeof newRegexCatId === "number" && newRegexPattern.trim()) {
            createRegexMutation.mutate({
                cat_id: newRegexCatId,
                regex: newRegexPattern.trim(),
            });
        }
    };

    const handleUpdateRegex = (regex: CategoryRegex) => {
        updateRegexMutation.mutate(regex);
    };

    const handleCreateSkippedApp = () => {
        if (newSkippedAppName.trim()) {
            createSkippedAppMutation.mutate({
                app_name: newSkippedAppName.trim(),
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

            {/* Categories Section */}
            <div className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">Categories</h2>
                
                {/* Add New Category */}
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

                {/* Categories List */}
                <div className="space-y-2">
                    {categories.map((cat) => (
                        <div key={cat.id} className="p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                            {editingCategory?.id === cat.id ? (
                                <div className="flex gap-3 flex-1">
                                    <input
                                        type="text"
                                        value={editingCategory.name}
                                        onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                                    />
                                    <input
                                        type="number"
                                        value={editingCategory.priority}
                                        onChange={(e) => setEditingCategory({ ...editingCategory, priority: parseInt(e.target.value) || 0 })}
                                        className="w-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                                    />
                                    <input
                                        type="color"
                                        value={editingCategory.color || "#000000"}
                                        onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                                        className="w-16 h-10 bg-gray-800 border border-gray-700 rounded cursor-pointer"
                                    />
                                    <button
                                        onClick={() => handleUpdateCategory(editingCategory)}
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
                                            <span className="text-gray-400 ml-3">Priority: {cat.priority}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditingCategory(cat)}
                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => deleteCategoryMutation.mutate(cat.id)}
                                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Category Regex Section */}
            <div>
                <h2 className="text-2xl font-semibold mb-4">Category Regex Patterns</h2>
                
                {/* Add New Regex */}
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

                {/* Regex List */}
                <div className="space-y-2">
                    {regexes.map((regex) => {
                        const category = categories.find((c) => c.id === regex.cat_id);
                        return (
                            <div key={regex.id} className="p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                                {editingRegex?.id === regex.id ? (
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
                                        <input
                                            type="text"
                                            value={editingRegex.regex}
                                            onChange={(e) => setEditingRegex({ ...editingRegex, regex: e.target.value })}
                                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                                        />
                                        <button
                                            onClick={() => handleUpdateRegex(editingRegex)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() => setEditingRegex(null)}
                                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
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
                                            </div>
                                        </div>
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
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Skipped Apps Section */}
            <div className="mt-8">
                <h2 className="text-2xl font-semibold mb-4">Skipped Apps</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Apps in this list will not be tracked. These are typically system windows and dialogs.
                </p>
                
                {/* Add New Skipped App */}
                <div className="mb-4 p-4 bg-gray-900 rounded-lg">
                    <h3 className="text-lg font-medium mb-3">Add Skipped App</h3>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="App name (exact match)"
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

                {/* Skipped Apps List */}
                <div className="space-y-2">
                    {skippedApps.map((app) => (
                        <div key={app.id} className="p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                            <div>
                                <span className="font-medium text-gray-200">{app.app_name || "(empty)"}</span>
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
        </div>
    );
}

