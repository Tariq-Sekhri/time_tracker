import {emptyImportRequest, type ExportManualCategory, type ImportManualEntry, type ImportReport, type ImportRequest} from "../../api/dataTransfer.ts";
import type {ColumnMapping, ConvertedRow, ParsedTable} from "../types.ts";

/* Pure helpers for the import screen: mapping validation, request building and review rows. */

export type MappingCheck = {
    ok: boolean;
    /** Blocking problems, written as instructions. */
    errors: string[];
    /** Rows have no start clock time, so entries are stacked from the day start hour. */
    usesDayStart: boolean;
};

export function validateMapping(mapping: ColumnMapping): MappingCheck {
    const has = (field: keyof ColumnMapping) => mapping[field] != null;
    const hasStartDate = has("start_datetime") || has("start_date") || has("date");
    const hasStartClock = has("start_datetime") || has("start_time");
    const hasEnd = has("end_datetime") || has("end_time") || has("duration");
    const errors: string[] = [];
    if (!hasStartDate) errors.push("Map a column to Start date, Date or Start date & time so each entry has a day.");
    if (!hasEnd) errors.push("Map an End time, End date & time or Duration column so each entry has a length.");
    else if (!hasStartClock && !has("duration")) errors.push("Without a start time, map a Duration column so entries can be placed from the day start hour.");
    return {ok: errors.length === 0, errors, usesDayStart: hasStartDate && !hasStartClock};
}

/** First few distinct non-empty values in a column, for the mapping grid. */
export function sampleValues(table: ParsedTable, column: number, limit = 3): string[] {
    const values: string[] = [];
    for (const row of table.rows) {
        const value = (row[column] ?? "").trim();
        if (value && !values.includes(value)) values.push(value);
        if (values.length >= limit) break;
    }
    return values;
}

export type DuplicateStrategy = ImportRequest["duplicate_strategy"];

export type TableRequest = {
    request: ImportRequest;
    /** For each entry in request.manual_entries, the table row it came from. */
    entryRows: number[];
};

export function tableRequest(converted: ConvertedRow[], duplicateStrategy: DuplicateStrategy, createMissingCategories: boolean): TableRequest {
    const entries: ImportManualEntry[] = [];
    const entryRows: number[] = [];
    for (const row of converted) {
        if (!row.entry) continue;
        entries.push(row.entry);
        entryRows.push(row.row);
    }
    return {
        request: {...emptyImportRequest(), duplicate_strategy: duplicateStrategy, create_missing_categories: createMissingCategories, manual_entries: entries},
        entryRows,
    };
}

export type BackupSection = "manual_entries" | "manual_categories" | "activity_categories" | "app_groups" | "skipped_apps" | "devices" | "activity_logs";

export const BACKUP_SECTIONS: {key: BackupSection; label: string; hint: string}[] = [
    {key: "manual_entries", label: "Manual time entries", hint: "Hand-logged time"},
    {key: "manual_categories", label: "Manual categories", hint: "Categories and subcategories"},
    {key: "activity_categories", label: "Activity categories & rules", hint: "Merged by name; missing rules are added"},
    {key: "app_groups", label: "App groups", hint: "App title merge rules"},
    {key: "skipped_apps", label: "Skipped apps", hint: "Apps excluded from tracking"},
    {key: "devices", label: "Devices", hint: "Device names; added as remote devices without credentials"},
    {key: "activity_logs", label: "Activity logs", hint: "Raw tracked activity; includes its device identities"},
];

export function backupSectionCount(request: ImportRequest, section: BackupSection): number {
    return request[section].length;
}

/** Copies the backup request keeping only the chosen sections. Devices travel with activity logs. */
export function backupRequest(source: ImportRequest, sections: Record<BackupSection, boolean>, duplicateStrategy: DuplicateStrategy, createMissingCategories: boolean): ImportRequest {
    return {
        ...emptyImportRequest(),
        duplicate_strategy: duplicateStrategy,
        create_missing_categories: createMissingCategories,
        manual_entries: sections.manual_entries ? source.manual_entries : [],
        manual_categories: sections.manual_categories ? source.manual_categories : [],
        activity_categories: sections.activity_categories ? source.activity_categories : [],
        app_groups: sections.app_groups ? source.app_groups : [],
        skipped_apps: sections.skipped_apps ? source.skipped_apps : [],
        devices: sections.devices || sections.activity_logs ? source.devices : [],
        activity_logs: sections.activity_logs ? source.activity_logs : [],
    };
}

export function requestIsEmpty(request: ImportRequest): boolean {
    return !request.manual_entries.length && !request.manual_categories.length && !request.activity_categories.length
        && !request.app_groups.length && !request.skipped_apps.length && !request.devices.length && !request.activity_logs.length;
}

export type ReviewStatus = "new" | "duplicate" | "error";

export type ReviewRow = {
    key: string;
    /** 1-based row number in the source table (header excluded), null for backups. */
    sourceRow: number | null;
    status: ReviewStatus;
    entry: ImportManualEntry | null;
    message: string | null;
};

/**
 * Merges conversion errors with the dry-run report into one row list.
 * `converted` is null for backups (every entry came straight from the file).
 */
export function reviewRows(entries: ImportManualEntry[], entryRows: number[] | null, converted: ConvertedRow[] | null, report: ImportReport | null): ReviewRow[] {
    const invalid = new Map((report?.manual_entries_invalid ?? []).map((issue) => [issue.index, issue.message]));
    const duplicates = new Set(report?.duplicate_indices ?? []);
    const fromEntry = (entry: ImportManualEntry, index: number, sourceRow: number | null): ReviewRow => {
        const message = invalid.get(index) ?? null;
        const status: ReviewStatus = message != null ? "error" : duplicates.has(index) ? "duplicate" : "new";
        return {key: `e${index}`, sourceRow, status, entry, message};
    };
    if (!converted) return entries.map((entry, index) => fromEntry(entry, index, null));
    const indexByRow = new Map((entryRows ?? []).map((row, index) => [row, index]));
    return converted.map((row) => {
        const index = indexByRow.get(row.row);
        if (row.entry && index != null) return fromEntry(entries[index], index, row.row + 1);
        return {key: `r${row.row}`, sourceRow: row.row + 1, status: "error", entry: null, message: row.error ?? "Could not read this row."};
    });
}

export function countByStatus(rows: ReviewRow[]): Record<ReviewStatus, number> {
    const counts: Record<ReviewStatus, number> = {new: 0, duplicate: 0, error: 0};
    for (const row of rows) counts[row.status]++;
    return counts;
}

/** Category path for a manual category option: ["Parent", "Child"], ["Name"], or [] for Uncategorized. */
export function categoryPath(category: ExportManualCategory): string[] {
    if (category.id == null) return [];
    return category.parent_name ? [category.parent_name, category.name] : [category.name];
}

export function pathKey(path: string[]): string {
    return path.map((part) => part.toLowerCase()).join("\u0000");
}

export function pathLabel(path: string[]): string {
    return path.length ? path.join(" › ") : "Uncategorized";
}
