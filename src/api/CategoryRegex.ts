import { AppError, invokeWithResult, Result } from "../types/types.ts";

export type CategoryRegex = {
    id: number,
    cat_id: number,
    regex: string,
}

export type NewCategoryRegex = {
    cat_id: number,
    regex: string,
}

export async function get_cat_regex(): Promise<Result<CategoryRegex[], AppError>> {
    return invokeWithResult<CategoryRegex[]>("get_cat_regex");
}


export async function get_cat_regex_by_id(id: number): Promise<Result<CategoryRegex, AppError>> {
    return invokeWithResult<CategoryRegex>("get_cat_regex_by_id", { id });
}

export async function delete_cat_regex_by_id(id: number): Promise<Result<null, AppError>> {

    return invokeWithResult<null>("delete_cat_regex_by_id", { id });
}

export async function insert_cat_regex(cat_regex: NewCategoryRegex): Promise<Result<number, AppError>> {

    return invokeWithResult<number>("insert_cat_regex", { cat_regex });
}



