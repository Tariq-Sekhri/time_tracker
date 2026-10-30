import {useQuery} from "@tanstack/react-query";
import {matchManualRule} from "../api/CategoryRegex.ts";
import {getManualCategories, MANUAL_CATEGORIES_QUERY_KEY, manualCategoryLabel} from "../api/ManualProject.ts";

/** Says where an Uncategorized entry will land once a rule picks up its title. */
export default function ManualRulePreview({title, projectId, enabled = true}: {title: string; projectId: number | null; enabled?: boolean}) {
    const trimmed = title.trim();
    const active = enabled && projectId == null && trimmed !== "";
    const {data: matchedId} = useQuery({
        queryKey: ["cat_regex", "match", trimmed],
        queryFn: () => matchManualRule(trimmed),
        enabled: active,
    });
    const {data: categories = []} = useQuery({
        queryKey: MANUAL_CATEGORIES_QUERY_KEY,
        queryFn: getManualCategories,
        enabled: active,
    });
    const category = active && matchedId != null ? categories.find((item) => item.id === matchedId) : undefined;
    if (!category) return null;
    return <p className="mt-1 truncate text-xs text-sky-300">Will go to {manualCategoryLabel(category, categories)}</p>;
}
