import { invokeWithResult } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

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

export async function get_categories(): Promise<Result<Category[], AppError>> {
    return invokeWithResult<Category[]>("get_categories");
}

export async function delete_category_by_id(id: number, cascade: boolean = false): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("delete_category_by_id", { id, cascade });
}

export async function get_category_by_id(id: number): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("get_category_by_id", { id });
}

export async function insert_category(newCat: NewCategory): Promise<Result<number, AppError>> {
    return invokeWithResult<number>("insert_category", { newCategory: newCat });
}

export async function update_category_by_id(cat: Category): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("update_category_by_id", { cat });
}
