import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {
    getManualCategories,
    MANUAL_CATEGORIES_QUERY_KEY,
    MANUAL_PROJECTS_QUERY_KEY,
    nestManualCategories,
    updateManualProjectPriority,
} from "../api/ManualProject.ts";
import {useToast} from "./Toast.tsx";

/** Decides which manual category wins when several of its rules match one title. */
export default function ManualCategoryPriorities() {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const {data: categories = []} = useQuery({queryKey: MANUAL_CATEGORIES_QUERY_KEY, queryFn: getManualCategories});
    const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

    const savePriority = useMutation({
        mutationFn: ({id, priority}: {id: number; priority: number}) => updateManualProjectPriority(id, priority),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: MANUAL_CATEGORIES_QUERY_KEY});
            queryClient.invalidateQueries({queryKey: MANUAL_PROJECTS_QUERY_KEY});
            queryClient.invalidateQueries({queryKey: ["cat_regex"]});
        },
        onError: (error: unknown) => {
            console.error("Failed to update priority:", error);
            showToast("Failed to update priority", "error", 5000, String(error));
        },
    });

    const rows = nestManualCategories(categories).filter((category) => category.id != null);
    if (rows.length === 0) return null;

    const rowIds = new Set(rows.map((category) => category.id));
    const isSubcategory = (category: {parent_id?: number | null}) => category.parent_id != null && rowIds.has(category.parent_id);
    const subcategoryCount = (id: number | null) => rows.filter((category) => category.parent_id === id).length;
    const toggleExpanded = (id: number) => setExpanded((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
    });

    return (
        <div className="mt-8">
            <h3 className="text-lg font-medium">Manual categories</h3>
            <p className="mb-3 text-sm text-gray-400">When several manual rules match a title, the highest priority wins.</p>
            <div className="space-y-2">
                {rows.filter((category) => !isSubcategory(category) || expanded.has(category.parent_id!)).map((category) => {
                    const subcategories = subcategoryCount(category.id);
                    const isExpanded = expanded.has(category.id!);
                    return <div key={category.id} className={`p-4 bg-gray-900 rounded-lg flex items-center justify-between ${isSubcategory(category) ? "ml-8" : ""}`}>
                        <div className="flex items-center gap-3 min-w-0">
                            {subcategories > 0 ? (
                                <button
                                    type="button"
                                    aria-expanded={isExpanded}
                                    aria-label={`${isExpanded ? "Hide" : "Show"} subcategories of ${category.name}`}
                                    onClick={() => toggleExpanded(category.id!)}
                                    className="shrink-0 text-gray-500 hover:text-gray-300"
                                >
                                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                                    </svg>
                                </button>
                            ) : !isSubcategory(category) && <span className="w-4 shrink-0"/>}
                            <div className="w-6 h-6 rounded border border-gray-600 shrink-0" style={{backgroundColor: category.color}}/>
                            <span className="font-medium truncate">{category.name}</span>
                            {subcategories > 0 && !isExpanded && <span className="text-sm text-gray-500 shrink-0">{subcategories}</span>}
                        </div>
                        <input
                            key={category.priority ?? 0}
                            type="number"
                            aria-label={`Priority for ${category.name}`}
                            defaultValue={category.priority ?? 0}
                            onBlur={(event) => {
                                const priority = parseInt(event.target.value) || 0;
                                if (priority !== (category.priority ?? 0)) savePriority.mutate({id: category.id!, priority});
                            }}
                            className="w-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                        />
                    </div>;
                })}
            </div>
        </div>
    );
}
