import { invokeOrThrow } from "../utils.ts";

export type CategoryRegex = {
    id: number;
    cat_id: number;
    regex: string;
};

export type NewCategoryRegex = {
    cat_id: number;
    regex: string;
};

/** One rule list: a rule targets either an auto category or a manual category. */
export type CategoryRule = {
    id: number;
    cat_id: number | null;
    manual_project_id: number | null;
    regex: string;
};

export type NewCategoryRule = Omit<CategoryRule, "id">;

export const CATEGORY_RULES_QUERY_KEY = ["cat_regex", "rules"] as const;
export const get_category_rules = () => invokeOrThrow<CategoryRule[]>("get_category_rules");
export const insert_category_rule = (rule: NewCategoryRule) => invokeOrThrow<number>("insert_category_rule", {rule});
export const update_category_rule = (rule: CategoryRule) => invokeOrThrow<null>("update_category_rule", {rule});
export const matchManualRule = (title: string) => invokeOrThrow<number | null>("match_manual_rule", {title});
export const applyManualRules = () => invokeOrThrow<number>("apply_manual_rules");

export type MatchingCategoryRule = {rule: CategoryRegex | null; category_name: string; subcategory: string | null};
export const getMatchingCategoryRule = (appName: string) =>
    invokeOrThrow<MatchingCategoryRule>("get_matching_category_rule", {appName});

export async function get_cat_regex(): Promise<CategoryRegex[]> {
    return invokeOrThrow<CategoryRegex[]>("get_cat_regex");
}


export async function get_cat_regex_by_id(id: number): Promise<CategoryRegex> {
    return invokeOrThrow<CategoryRegex>("get_cat_regex_by_id", { id });
}

export async function delete_cat_regex_by_id(id: number): Promise<null> {
    return invokeOrThrow<null>("delete_cat_regex_by_id", { id });
}

export async function insert_cat_regex(cat_regex: NewCategoryRegex): Promise<number> {
    return invokeOrThrow<number>("insert_cat_regex", { newCategoryRegex: cat_regex });
}

export async function update_cat_regex_by_id(catRegex: CategoryRegex): Promise<null> {
    return invokeOrThrow<null>("update_cat_regex_by_id", { catRegex });
}



