import {emptyImportRequest} from "../../../api/dataTransfer.ts";
import type {
    ExportActivityCategory,
    ExportAppGroup,
    ImportActivityLog,
    ImportManualCategory,
    ImportManualEntry,
    ImportRequest,
} from "../../../api/dataTransfer.ts";
import {ImportFileError} from "./text.ts";

export const BACKUP_FORMAT = "time-tracker-export";
export const BACKUP_VERSION = 1;

export type ParsedBackup = {
    request: ImportRequest;
    generatedAt: number | null;
    rangeStart: number | null;
    rangeEnd: number | null;
};

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const objects = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter(isObj) : []);

/**
 * Parses our JSON export into an ImportRequest (dry_run true). Malformed required fields
 * fail with a section and row number so damaged backups cannot silently lose data.
 * activity_sessions are derived data (rebuilt from logs) and are not imported.
 */
export function parseBackup(text: string): ParsedBackup {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new ImportFileError("This JSON file couldn't be read: it isn't valid JSON.");
    }
    if (!isObj(data) || data.format !== BACKUP_FORMAT) {
        throw new ImportFileError("This JSON file isn't a Time Tracker export. Only JSON files exported from Time Tracker (Settings → Import & export) can be imported; use CSV or Excel for other apps.");
    }
    const version = num(data.version);
    if (version !== BACKUP_VERSION) {
        throw new ImportFileError(
            version !== null && version > BACKUP_VERSION
                ? `This export was made by a newer version of Time Tracker (format version ${version}). Update the app to import it.`
                : `Unsupported Time Tracker export version (${String(data.version)}).`,
        );
    }

    validateSections(data);
    const request = emptyImportRequest();
    request.manual_entries = objects(data.manual_entries).flatMap((row) => {
        const entry = manualEntry(row);
        return entry ? [entry] : [];
    });
    request.manual_categories = manualCategories(objects(data.manual_categories));
    request.activity_categories = objects(data.activity_categories).flatMap((row) => {
        const category = activityCategory(row);
        return category ? [category] : [];
    });
    request.app_groups = objects(data.app_groups).flatMap((row): ExportAppGroup[] => {
        const name = str(row.name);
        const regex = str(row.regex);
        return name && regex !== null ? [{name, regex}] : [];
    });
    request.skipped_apps = Array.isArray(data.skipped_apps) ? data.skipped_apps.filter((v): v is string => typeof v === "string" && v !== "") : [];

    const logs = objects(data.activity_logs);
    request.activity_logs = logs.flatMap((row) => {
        const log = activityLog(row);
        return log ? [log] : [];
    });
    request.devices = devices(objects(data.devices), logs, request.activity_logs);

    return {
        request,
        generatedAt: num(data.generated_at),
        rangeStart: num(data.range_start),
        rangeEnd: num(data.range_end),
    };
}

function validateSections(data: Obj): void {
    const validators: Record<string, (row: Obj) => boolean> = {
        manual_entries: (row) => manualEntry(row) !== null,
        manual_categories: (row) => row.id === null || (num(row.id) !== null && !!str(row.name)?.trim()),
        activity_categories: (row) => activityCategory(row) !== null,
        app_groups: (row) => !!str(row.name)?.trim() && str(row.regex) !== null,
        devices: (row) => !!str(row.uuid)?.trim(),
        activity_logs: (row) => activityLog(row) !== null,
    };
    for (const [section, valid] of Object.entries(validators)) {
        const rows = data[section];
        if (rows === undefined) continue;
        if (!Array.isArray(rows)) throw new ImportFileError(`Invalid ${section} section: expected a list.`);
        rows.forEach((row, index) => {
            if (!isObj(row) || !valid(row)) throw new ImportFileError(`Invalid ${section} row ${index + 1}: required fields are missing or have invalid values.`);
        });
    }
    if (data.skipped_apps !== undefined && (!Array.isArray(data.skipped_apps) || data.skipped_apps.some((row) => typeof row !== "string"))) {
        throw new ImportFileError("Invalid skipped_apps section: expected a list of rules.");
    }
}

function manualEntry(row: Obj): ImportManualEntry | null {
    const start = num(row.start_time);
    const end = num(row.end_time);
    if (start === null || end === null) return null;
    const title = (str(row.title) ?? "").trim() || "Unnamed";
    const notes = str(row.notes);
    return {title, notes: notes && notes.trim() ? notes : null, category_path: categoryPath(row), start_time: start, end_time: end};
}

function categoryPath(row: Obj): string[] {
    if (row.category_id === null) return [];
    const category = (str(row.category) ?? "").trim();
    const parent = (str(row.parent_category) ?? "").trim();
    if (!category) return parent ? [parent] : [];
    if (!parent && category.toLowerCase() === "uncategorized") return [];
    return parent ? [parent, category] : [category];
}

/** Skips the Uncategorized pseudo row (id null) and lists parents before their children. */
function manualCategories(rows: Obj[]): ImportManualCategory[] {
    const result = rows.flatMap((row): ImportManualCategory[] => {
        if (row.id === null || row.id === undefined) return [];
        const name = (str(row.name) ?? "").trim();
        if (!name) return [];
        const parent = (str(row.parent_name) ?? "").trim();
        return [{name, color: str(row.color), parent_name: parent || null}];
    });
    return [...result.filter((c) => c.parent_name === null), ...result.filter((c) => c.parent_name !== null)];
}

function activityCategory(row: Obj): ExportActivityCategory | null {
    const name = (str(row.name) ?? "").trim();
    if (!name) return null;
    return {
        name,
        color: str(row.color),
        priority: num(row.priority) ?? 0,
        is_visible: bool(row.is_visible, true),
        in_stats: bool(row.in_stats, true),
        rules: Array.isArray(row.rules) ? row.rules.filter((v): v is string => typeof v === "string") : [],
    };
}

function activityLog(row: Obj): ImportActivityLog | null {
    const device_uuid = str(row.device_uuid);
    const id = num(row.id);
    const app = str(row.app);
    const timestamp = num(row.timestamp);
    const duration = num(row.duration);
    if (!device_uuid || id === null || !Number.isInteger(id) || app === null || timestamp === null || duration === null || duration < 0) return null;
    return {device_uuid, id, app, timestamp, duration};
}

/** Devices from the export plus any device referenced by an imported log but missing from the list. */
function devices(rows: Obj[], rawLogs: Obj[], logs: ImportActivityLog[]): {uuid: string; name: string}[] {
    const result = new Map<string, {uuid: string; name: string}>();
    for (const row of rows) {
        const uuid = str(row.uuid);
        if (!uuid) continue;
        result.set(uuid, {uuid, name: (str(row.name) ?? "").trim() || uuid});
    }
    const referenced = new Set(logs.map((log) => log.device_uuid));
    for (const row of rawLogs) {
        const uuid = str(row.device_uuid);
        if (!uuid || result.has(uuid) || !referenced.has(uuid)) continue;
        result.set(uuid, {uuid, name: (str(row.device_name) ?? "").trim() || uuid});
    }
    return [...result.values()];
}
