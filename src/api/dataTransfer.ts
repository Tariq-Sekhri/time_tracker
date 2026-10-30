import {invoke} from "@tauri-apps/api/core";
import {invokeOrThrow} from "../utils.ts";

/*
 * Contract between the Rust import/export commands (src-tauri/src/data_transfer.rs)
 * and the frontend. All timestamps are unix seconds; durations are seconds.
 */

export type ExportInclude = {
    manual_entries: boolean;
    activity_sessions: boolean;
    activity_logs: boolean;
    devices: boolean;
    activity_categories: boolean;
    manual_categories: boolean;
    app_groups: boolean;
    skipped_apps: boolean;
};

export type ExportScope = {
    /** Inclusive start. Entries, sessions and logs are selected by their start time. */
    range_start: number;
    /** Exclusive end. */
    range_end: number;
    /** null = every device. Filters activity sessions and logs only. */
    device_uuids: string[] | null;
    /** Activity category names; null = all. Filters activity sessions and logs only. */
    activity_categories: string[] | null;
    /** Manual category ids; null = all. A null entry selects Uncategorized. Selecting a parent does NOT implicitly select its subcategories. */
    manual_category_ids: (number | null)[] | null;
    include: ExportInclude;
};

export type ExportManualEntry = {
    id: number;
    title: string;
    notes: string | null;
    category_id: number | null;
    /** "Uncategorized" when category_id is null. */
    category: string;
    /** Set when the category is a subcategory. */
    parent_category: string | null;
    category_color: string;
    start_time: number;
    end_time: number;
    duration: number;
    created_at: number;
    updated_at: number;
};

export type ExportSessionApp = {app: string; duration: number};

/** A calendar time block of automatically tracked activity, built per device with the user's timeblock settings. */
export type ExportActivitySession = {
    device_uuid: string;
    device_name: string;
    category: string;
    category_color: string | null;
    start_time: number;
    end_time: number;
    /** end_time - start_time. */
    duration: number;
    /** Sum of tracked app time inside the block. */
    active_duration: number;
    /** Sorted by duration, largest first. App groups applied. */
    apps: ExportSessionApp[];
};

export type ExportActivityLog = {
    device_uuid: string;
    device_name: string;
    id: number;
    /** Raw window/app title. */
    app: string;
    /** App group name when the app matches one, otherwise null. */
    app_group: string | null;
    category: string;
    timestamp: number;
    duration: number;
};

export type ExportDevice = {
    uuid: string;
    name: string;
    kind: "local" | "remote";
    in_cal: boolean;
    in_stats: boolean;
};

export type ExportActivityCategory = {
    name: string;
    color: string | null;
    priority: number;
    is_visible: boolean;
    in_stats: boolean;
    /** Category rule regexes. */
    rules: string[];
    /** Set on subcategories. */
    parent_name?: string | null;
};

export type ExportManualCategory = {
    /** null = Uncategorized. */
    id: number | null;
    name: string;
    color: string;
    parent_id: number | null;
    parent_name: string | null;
    priority: number;
    /** Rule regexes that send entries to this category. */
    rules: string[];
};

export type ExportAppGroup = {name: string; regex: string};

export type ExportDataset = {
    generated_at: number;
    app_version: string;
    range_start: number;
    range_end: number;
    /** Each array is empty when its include flag is off. */
    manual_entries: ExportManualEntry[];
    activity_sessions: ExportActivitySession[];
    activity_logs: ExportActivityLog[];
    devices: ExportDevice[];
    activity_categories: ExportActivityCategory[];
    manual_categories: ExportManualCategory[];
    app_groups: ExportAppGroup[];
    /** Skipped-app regexes. */
    skipped_apps: string[];
};

/** Lists used to populate the export filter pickers. */
export type ExportFilterOptions = {
    devices: ExportDevice[];
    activity_categories: {name: string; color: string | null}[];
    manual_categories: ExportManualCategory[];
    /** Earliest and latest data timestamps across logs and manual entries, null when empty. */
    data_start: number | null;
    data_end: number | null;
};

export type ImportManualEntry = {
    title: string;
    notes: string | null;
    /** [] = Uncategorized, ["Client"] or ["Client", "Project"] (max depth 2). Matched case-insensitively. */
    category_path: string[];
    start_time: number;
    end_time: number;
};

export type ImportManualCategory = {name: string; color: string | null; parent_name: string | null; priority: number; rules: string[]};

export type ImportActivityLog = {device_uuid: string; id: number; app: string; timestamp: number; duration: number};

export type ImportRequest = {
    /** Validate and count without writing anything. */
    dry_run: boolean;
    /** "skip" ignores entries matching an existing entry's start, end and title (case-insensitive). */
    duplicate_strategy: "skip" | "import";
    /** When false, entries whose category does not exist are imported as Uncategorized. */
    create_missing_categories: boolean;
    manual_entries: ImportManualEntry[];
    manual_categories: ImportManualCategory[];
    /** Merged by name; existing categories keep their settings, missing rules are added. */
    activity_categories: ExportActivityCategory[];
    app_groups: ExportAppGroup[];
    skipped_apps: string[];
    /** Devices referenced by activity_logs. Missing devices are added as remote, non-tracking devices. */
    devices: {uuid: string; name: string}[];
    /** Inserted with INSERT OR IGNORE on (device_uuid, id). */
    activity_logs: ImportActivityLog[];
};

export type ImportRowIssue = {
    /** Index into ImportRequest.manual_entries. */
    index: number;
    message: string;
};

export type ImportReport = {
    dry_run: boolean;
    manual_entries_imported: number;
    manual_entries_duplicate: number;
    /** Indices of entries that matched an existing entry (or an earlier entry in the same file). */
    duplicate_indices: number[];
    manual_entries_invalid: ImportRowIssue[];
    manual_categories_created: string[];
    activity_categories_created: string[];
    category_rules_added: number;
    app_groups_added: number;
    skipped_apps_added: number;
    devices_added: number;
    activity_logs_imported: number;
    activity_logs_duplicate: number;
};

export function emptyImportRequest(): ImportRequest {
    return {
        dry_run: true,
        duplicate_strategy: "skip",
        create_missing_categories: true,
        manual_entries: [],
        manual_categories: [],
        activity_categories: [],
        app_groups: [],
        skipped_apps: [],
        devices: [],
        activity_logs: [],
    };
}

export const getExportFilterOptions = () => invokeOrThrow<ExportFilterOptions>("get_export_filter_options");

export const exportDataset = (scope: ExportScope) => invokeOrThrow<ExportDataset>("export_dataset", {scope});

export const importDataset = (request: ImportRequest) => invokeOrThrow<ImportReport>("import_dataset", {request});

/** Writes bytes to a path the user picked in a save dialog. Sent as a raw IPC body. */
export async function saveExportFile(path: string, bytes: Uint8Array): Promise<void> {
    await invoke("save_export_file", bytes, {headers: {"x-export-path": encodeURIComponent(path)}});
}

/** Reads a file the user picked in an open dialog. */
export async function readImportFile(path: string): Promise<Uint8Array> {
    const result = await invoke<ArrayBuffer | number[]>("read_import_file", {path});
    return result instanceof ArrayBuffer ? new Uint8Array(result) : Uint8Array.from(result);
}
