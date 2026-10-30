import type {SubcategoryStat} from "../api/statistics.ts";
import {formatDuration} from "../Screens/Calander/utils.ts";

/** The subcategory split shown under a category in the statistics sidebars. */
export default function SubcategoryRows({subcategories}: {subcategories?: SubcategoryStat[]}) {
    if (!subcategories?.length) return null;
    return (
        <div className="mt-1 ml-5 space-y-0.5">
            {subcategories.map((subcategory) => (
                <div key={subcategory.name} className="flex items-center justify-between gap-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5 min-w-0">
                        {subcategory.color && <span className="w-2 h-2 rounded-sm shrink-0" style={{backgroundColor: subcategory.color}}/>}
                        <span className="truncate">{subcategory.name}</span>
                    </span>
                    <span className="shrink-0">{formatDuration(subcategory.total_duration)}</span>
                </div>
            ))}
        </div>
    );
}
