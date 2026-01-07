import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { get_categories, Category } from "../api/Category.ts";
import {
    get_cat_regex,
    insert_cat_regex,
    update_cat_regex_by_id,
    delete_cat_regex_by_id,
    CategoryRegex,
    NewCategoryRegex
} from "../api/CategoryRegex.ts";
import { unwrapResult } from "../utils.ts";

// Validate regex pattern - returns error message or null if valid
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
    const [editingRegex, setEditingRegex] = useState<CategoryRegex | null>(null);
    const [newRegexCatId, setNewRegexCatId] = useState<number | "">("");
    const [newRegexPattern, setNewRegexPattern] = useState("");
    const [regexError, setRegexError] = useState<string | null>(null);
    const [editRegexError, setEditRegexError] = useState<string | null>(null);

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: async () => unwrapResult(await get_categories()),
    });

    const { data: regexes = [] } = useQuery({
        queryKey: ["cat_regex"],
        queryFn: async () => unwrapResult(await get_cat_regex()),
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

    const handleCreateRegex = () => {
        const error = validateRegex(newRegexPattern);
        if (error) {
            setRegexError(error);
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
        const error = validateRegex(regex.regex);
        if (error) {
            setEditRegexError(error);
            return;
        }
        setEditRegexError(null);
        updateRegexMutation.mutate(regex);
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ["cat_regex"] });
        queryClient.invalidateQueries({ queryKey: ["categories"] });
    };

    return (
        <div className="p-6 text-white">
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
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingRegex(null);
                                            setEditRegexError(null);
                                        }}
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
    );
}

