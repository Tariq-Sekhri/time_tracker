import {invokeOrThrow} from "../utils.ts";

export type AppGroup = {
    id: number;
    name: string;
    regex: string;
};

export type NewAppGroup = Omit<AppGroup, "id">;

export async function get_app_groups(): Promise<AppGroup[]> {
    return invokeOrThrow<AppGroup[]>("get_app_groups");
}

export async function insert_app_group(appGroup: NewAppGroup): Promise<number> {
    return invokeOrThrow<number>("insert_app_group", {newAppGroup: appGroup});
}

export async function update_app_group(appGroup: AppGroup): Promise<null> {
    return invokeOrThrow<null>("update_app_group", {appGroup});
}

export async function delete_app_group(id: number): Promise<null> {
    return invokeOrThrow<null>("delete_app_group", {id});
}

