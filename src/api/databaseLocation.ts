import { invokeOrThrow } from "../utils.ts";

export type DatabaseLocationInfo = {
    path: string;
    default_path: string;
    is_custom: boolean;
};

export type DatabaseLocationProbe = {
    path: string;
    exists: boolean;
    is_valid_sqlite: boolean;
};

export type SetDatabaseLocationResult =
    | { status: "ok"; path: string }
    | { status: "needs_overwrite_confirmation"; path: string };

export async function getDatabaseLocation(): Promise<DatabaseLocationInfo> {
    return invokeOrThrow<DatabaseLocationInfo>("get_database_location");
}

export async function probeDatabaseLocation(path: string): Promise<DatabaseLocationProbe> {
    return invokeOrThrow<DatabaseLocationProbe>("probe_database_location", { path });
}

export async function setDatabaseLocation(
    path: string,
    overwrite: boolean
): Promise<SetDatabaseLocationResult> {
    return invokeOrThrow<SetDatabaseLocationResult>("set_database_location", { path, overwrite });
}

export async function resetDatabaseLocation(): Promise<DatabaseLocationInfo> {
    return invokeOrThrow<DatabaseLocationInfo>("reset_database_location");
}
