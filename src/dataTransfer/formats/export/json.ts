import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ExportFile} from "../../types.ts";
import {fileName} from "./table.ts";

/*
 * Full-backup JSON: the ExportDataset fields verbatim (unix seconds, durations in seconds)
 * plus a format/version header. Parsed by formats/import.
 */

export const JSON_EXPORT_FORMAT = "time-tracker-export";
export const JSON_EXPORT_VERSION = 1;
export const JSON_MIME = "application/json";

export type JsonExport = {format: typeof JSON_EXPORT_FORMAT; version: typeof JSON_EXPORT_VERSION} & ExportDataset;

export function toJsonExport(data: ExportDataset): JsonExport {
    return {
        format: JSON_EXPORT_FORMAT,
        version: JSON_EXPORT_VERSION,
        generated_at: data.generated_at,
        app_version: data.app_version,
        range_start: data.range_start,
        range_end: data.range_end,
        manual_entries: data.manual_entries,
        activity_sessions: data.activity_sessions,
        activity_logs: data.activity_logs,
        devices: data.devices,
        activity_categories: data.activity_categories,
        manual_categories: data.manual_categories,
        app_groups: data.app_groups,
        skipped_apps: data.skipped_apps,
    };
}

export function buildJsonFile(data: ExportDataset): ExportFile {
    return {
        fileName: fileName(data, "export", "json"),
        mimeType: JSON_MIME,
        bytes: new TextEncoder().encode(JSON.stringify(toJsonExport(data), null, 2) + "\n"),
    };
}
