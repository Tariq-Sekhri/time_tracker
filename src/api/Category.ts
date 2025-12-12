import {AppError, invokeWithResult, Result} from "../types/types.ts";

export type Category = {
    id: number,
    name: string,
    priority: number
}

export async function get_categories(): Promise<Result<Category[], AppError>> {
    return invokeWithResult<Category[]>("get_categories");
}