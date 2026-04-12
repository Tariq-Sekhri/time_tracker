import type { Category } from "../api/Category.ts";
import type { CategoryRegex } from "../api/CategoryRegex.ts";

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
    rows.sort((a, b) => b.priority - a.priority);
    for (const row of rows) {
        try {
            const re = new RegExp(row.regexStr);
            if (re.test(appName)) {
                const cat = catById.get(row.catId);
                return { matchedRegex: row.regexStr, categoryName: cat?.name ?? "Unknown" };
            }
        } catch {
            continue;
        }
    }
    return { matchedRegex: null, categoryName: "Miscellaneous" };
}
