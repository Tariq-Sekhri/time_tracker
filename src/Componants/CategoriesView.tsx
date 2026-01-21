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
import { get_cat_regex } from "../api/CategoryRegex.ts";
import { unwrapResult } from "../utils.ts";
import { ToastContainer, useToast } from "./Toast.tsx";

export default function CategoriesView() {
    const queryClient = useQueryClient();
    const { showToast, toasts, removeToast } = useToast();
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryPriority, setNewCategoryPriority] = useState(0);
    const [newCategoryColor, setNewCategoryColor] = useState("#000000");
    const [showCascadeDeleteConfirm, setShowCascadeDeleteConfirm] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);
    const [cascadeDelete, setCascadeDelete] = useState(true);
    const [regexCount, setRegexCount] = useState(0);

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: async () => unwrapResult(await get_categories()),
    });

    const { data: regexes = [] } = useQuery({
        queryKey: ["cat_regex"],
        queryFn: async () => unwrapResult(await get_cat_regex()),
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
        onError: (error) => {
            console.error("Failed to create category:", error);
        }
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
        onError: (error) => {
            console.error("Failed to delete category:", error);
            showToast("Failed to delete category", "error");
        },
    });

    const handleDeleteCategoryClick = (id: number) => {
        setCategoryToDelete(id);
        setCascadeDelete(true); // Default to cascade delete

        // Count how many regex patterns are associated with this category
        const count = regexes.filter(regex => regex.cat_id === id).length;
        setRegexCount(count);

        setShowCascadeDeleteConfirm(true);
    };

    const handleConfirmDeleteCategory = (cascade: boolean) => {
        if (categoryToDelete !== null) {
            deleteCategoryMutation.mutate({ id: categoryToDelete, cascade });
        }
    };

    const handleCreateCategory = () => {
        console.log("Creating category:", newCategoryName.trim());
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

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ["categories"] });
    };


    return (
        <div className="p-6 text-white">
            <ToastContainer toasts={toasts} onRemove={removeToast} />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Categories</h1>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>
            </div>

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
                {[...categories].sort((a, b) => b.priority - a.priority).map((cat) => (
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
                                    onChange={(e) => setEditingCategory({
                                        ...editingCategory,
                                        priority: parseInt(e.target.value) || 0
                                    })}
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
                                        onClick={() => handleDeleteCategoryClick(cat.id)}
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

            {/* Cascade Delete Confirmation Modal */}
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

