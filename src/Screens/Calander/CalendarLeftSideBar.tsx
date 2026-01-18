import {Category} from "../../api/Category.ts";
import {getCategoryColor} from "./utils.ts";

interface CalanderHeaderProps {
    categories: Category[],
    visibleCategories: Set<string>,
    categoryColorMap: Map<string, string>,
    toggleCategory: (categoryName: string) => void,

}


export default function CalendarLeftSideBar({
                                                categories,
                                                visibleCategories,
                                                categoryColorMap,
                                                toggleCategory
                                            }: CalanderHeaderProps) {

    return <div className="w-64 border-r border-gray-700 bg-black p-4 overflow-y-auto flex-shrink-0">
        <h3 className="text-lg font-semibold text-white mb-4">Filter Categories</h3>
        <div className="space-y-2">
            {categories.map((category) => {
                const categoryName = category.name;
                const isVisible = visibleCategories.has(categoryName);
                const dbColor = categoryColorMap.get(categoryName);
                const color = getCategoryColor(categoryName, dbColor);

                return (
                    <label
                        key={category.id}
                        className="flex items-center gap-3 p-2 rounded hover:bg-gray-900 cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => toggleCategory(categoryName)}
                            className="w-4 h-4 rounded cursor-pointer"
                        />
                        <div
                            className="w-4 h-4 rounded border border-gray-600"
                            style={{backgroundColor: color}}
                        />
                        <span className="text-sm text-gray-200 flex-1">{categoryName}</span>
                    </label>
                );
            })}
        </div>
    </div>
}
