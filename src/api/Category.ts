import { invokeOrThrow } from "../utils.ts";

export type Category = {
    id: number;
    name: string;
    priority: number;
    color?: string | null;
    regex_enabled: boolean;
    is_visible: boolean;
    in_stats: boolean;
    is_collapsed: boolean;
    parent_id: number | null;
};

export type NewCategory = {
    name: string;
    priority: number;
    color?: string | null;
    regex_enabled: boolean;
    is_visible: boolean;
    in_stats: boolean;
    is_collapsed: boolean;
    parent_id?: number | null;
};

/** Top-level categories only: everything that groups time by category works on these. */
export async function get_categories(): Promise<Category[]> {
    return (await get_all_categories()).filter((category) => category.parent_id == null);
}

export const ALL_CATEGORIES_QUERY_KEY = ["categories", "all"] as const;
export async function get_all_categories(): Promise<Category[]> {
    return invokeOrThrow<Category[]>("get_categories");
}

/** "Coding › Rust" for subcategories, the plain name otherwise. */
export function categoryLabel(category: Category, all: Category[]): string {
    const parent = category.parent_id == null ? undefined : all.find((item) => item.id === category.parent_id);
    return parent ? `${parent.name} › ${category.name}` : category.name;
}

export async function delete_category_by_id(id: number, cascade: boolean = false): Promise<null> {
    return invokeOrThrow<null>("delete_category_by_id", {id, cascade});
}

export async function get_category_by_id(id: number): Promise<null> {
    return invokeOrThrow<null>("get_category_by_id", {id});
}

export async function insert_category(newCat: NewCategory): Promise<number> {
    return invokeOrThrow<number>("insert_category", {newCategory: newCat});
}

export async function update_category_by_id(cat: Category): Promise<null> {
    return invokeOrThrow<null>("update_category_by_id", {cat});
}
