import { invokeOrThrow } from "../utils.ts";

export type Category = {
    id: number;
    name: string;
    priority: number;
    color?: string | null;
};

export type NewCategory = {
    name: string;
    priority: number;
    color?: string | null;
};

export async function get_categories(): Promise<Category[]> {
    return invokeOrThrow<Category[]>("get_categories");
}

export async function delete_category_by_id(id: number, cascade: boolean = false): Promise<null> {
    return invokeOrThrow<null>("delete_category_by_id", { id, cascade });
}

export async function get_category_by_id(id: number): Promise<null> {
    return invokeOrThrow<null>("get_category_by_id", { id });
}

export async function insert_category(newCat: NewCategory): Promise<number> {
    return invokeOrThrow<number>("insert_category", { newCategory: newCat });
}

export async function update_category_by_id(cat: Category): Promise<null> {
    return invokeOrThrow<null>("update_category_by_id", { cat });
}
