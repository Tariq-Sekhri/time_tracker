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



