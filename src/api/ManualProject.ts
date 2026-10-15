import {invokeOrThrow} from "../utils.ts";

export type ManualProject = {id: number; name: string; parent_id?: number | null};
export const MANUAL_PROJECTS_QUERY_KEY = ["manualProjects"] as const;
export const getManualProjects = () => invokeOrThrow<ManualProject[]>("get_manual_projects");
export const createManualProject = (name: string, parentId: number | null = null) => invokeOrThrow<number>("create_manual_project", {name, parentId});
export const updateManualProject = (id: number, name: string) => invokeOrThrow<void>("update_manual_project", {id, name});
export const deleteManualProject = (id: number) => invokeOrThrow<void>("delete_manual_project", {id});

export type ManualCategory = {id: number | null; name: string; color: string; parent_id?: number | null};
export const MANUAL_CATEGORIES_QUERY_KEY = ["manualCategories"] as const;
export const getManualCategories = () => invokeOrThrow<ManualCategory[]>("get_manual_categories");
export const updateManualCategory = (id: number | null, name: string, color: string) =>
    invokeOrThrow<void>("update_manual_category", {id, name, color});

/** "School › Homework" for subcategories, the plain name otherwise. */
export function manualCategoryLabel<T extends {name: string; parent_id?: number | null}>(category: T, all: (T & {id: number | null})[]): string {
    const parent = category.parent_id == null ? undefined : all.find((item) => item.id === category.parent_id);
    return parent ? `${parent.name} › ${category.name}` : category.name;
}

/** Keeps the given order for top-level entries and places each subcategory directly after its parent. */
export function nestManualCategories<T extends {id: number | null; parent_id?: number | null}>(items: T[]): T[] {
    const ids = new Set(items.map((item) => item.id));
    const isChild = (item: T) => item.parent_id != null && ids.has(item.parent_id);
    return items.filter((item) => !isChild(item)).flatMap((parent) => [parent, ...items.filter((item) => isChild(item) && item.parent_id === parent.id)]);
}
