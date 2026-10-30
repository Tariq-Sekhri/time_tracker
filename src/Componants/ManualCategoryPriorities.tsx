import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
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

    return (
        <div className="mt-8">
            <h3 className="text-lg font-medium">Manual categories</h3>
            <p className="mb-3 text-sm text-gray-400">When several manual rules match a title, the highest priority wins.</p>
            <div className="space-y-2">
                {rows.map((category) => (
                    <div key={category.id} className={`p-4 bg-gray-900 rounded-lg flex items-center justify-between ${category.parent_id != null ? "ml-8" : ""}`}>
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-6 h-6 rounded border border-gray-600 shrink-0" style={{backgroundColor: category.color}}/>
                            <span className="font-medium truncate">{category.name}</span>
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
                    </div>
                ))}
            </div>
        </div>
    );
}
