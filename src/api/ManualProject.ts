import {invokeOrThrow} from "../utils.ts";

export type ManualProject = {id: number; name: string};
export const MANUAL_PROJECTS_QUERY_KEY = ["manualProjects"] as const;
export const getManualProjects = () => invokeOrThrow<ManualProject[]>("get_manual_projects");
export const createManualProject = (name: string) => invokeOrThrow<number>("create_manual_project", {name});
export const updateManualProject = (id: number, name: string) => invokeOrThrow<void>("update_manual_project", {id, name});
export const deleteManualProject = (id: number) => invokeOrThrow<void>("delete_manual_project", {id});
