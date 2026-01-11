import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {
    get_categories,
    insert_category,
    update_category_by_id,
    delete_category_by_id,
    Category,
    NewCategory
} from "../api/Category.ts";
import {unwrapResult} from "../utils.ts";

export default function CategoriesView() {
    const queryClient = useQueryClient();
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryPriority, setNewCategoryPriority] = useState(0);
    const [newCategoryColor, setNewCategoryColor] = useState("#000000");

    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: async () => unwrapResult(await get_categories()),
    });

    const createCategoryMutation = useMutation({
        mutationFn: async (newCat: NewCategory) => {
            return unwrapResult(await insert_category(newCat));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["categories"]});
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
            queryClient.invalidateQueries({queryKey: ["categories"]});
            setEditingCategory(null);
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_category_by_id(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["categories"]});
            queryClient.invalidateQueries({queryKey: ["cat_regex"]});
        },
    });

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
        queryClient.invalidateQueries({queryKey: ["categories"]});
    };


    return (
        <div className="p-6 text-white">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Categories</h1>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
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
                                    onChange={(e) => setEditingCategory({...editingCategory, name: e.target.value})}
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
                                    onChange={(e) => setEditingCategory({...editingCategory, color: e.target.value})}
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
                                        style={{backgroundColor: cat.color || "#000000"}}
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
    );
}

