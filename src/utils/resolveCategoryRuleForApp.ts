import type { Category } from "../api/Category.ts";
import type { CategoryRegex } from "../api/CategoryRegex.ts";
import { pickBestMatchingRegex } from "./pickBestMatchingRegex.ts";

export type ResolvedCategoryRule = {
    matchedRegex: string | null;
    categoryName: string;
};

export function resolveCategoryRuleForApp(
    appName: string,
    categories: Category[],
    catRegex: CategoryRegex[]
): ResolvedCategoryRule {
    const catById = new Map(categories.map((c) => [c.id, c]));
    type Row = { regexStr: string; catId: number; priority: number };
    const rows: Row[] = [];
    for (const r of catRegex) {
        const cat = catById.get(r.cat_id);
        if (!cat) continue;
        rows.push({ regexStr: r.regex, catId: r.cat_id, priority: cat.priority });
    }
    const best = pickBestMatchingRegex(appName, rows);
    if (!best) {
        return { matchedRegex: null, categoryName: "Miscellaneous" };
    }
    const cat = catById.get(best.catId);
    return { matchedRegex: best.regexStr, categoryName: cat?.name ?? "Unknown" };
}
