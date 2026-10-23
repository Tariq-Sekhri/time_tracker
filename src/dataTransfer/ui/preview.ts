import type {ExportDataset} from "../../api/dataTransfer.ts";
import type {ExportFile, ExportFormat, ExportOptions} from "../types.ts";

/* Helpers for the export preview and the save dialogs. */

export const PREVIEW_ROWS = 20;

/** Same dataset with every list capped, so a preview build is instant even for huge ranges. */
export function sliceDataset(dataset: ExportDataset, limit = PREVIEW_ROWS): ExportDataset {
    return {
        ...dataset,
        manual_entries: dataset.manual_entries.slice(0, limit),
        activity_sessions: dataset.activity_sessions.slice(0, limit),
        activity_logs: dataset.activity_logs.slice(0, limit),
        devices: dataset.devices.slice(0, limit),
        activity_categories: dataset.activity_categories.slice(0, limit),
        manual_categories: dataset.manual_categories.slice(0, limit),
        app_groups: dataset.app_groups.slice(0, limit),
        skipped_apps: dataset.skipped_apps.slice(0, limit),
    };
}

/**
 * Options for a table preview of a CSV/Excel export: the same columns and layout, rendered
 * as plain comma CSV so the preview can be parsed back. Excel shares CSV's column layout.
 */
export function tablePreviewOptions(options: ExportOptions): ExportOptions {
    return {...options, format: "csv", csvDelimiter: ",", csvBom: false};
}

/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF), enough for previewing our own output. */
export function parseCsv(text: string, delimiter = ","): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quoted) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"';
                    i++;
                } else quoted = false;
            } else field += char;
        } else if (char === '"' && field === "") quoted = true;
        else if (char === delimiter) {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && source[i + 1] === "\n") i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else field += char;
    }
    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

export type PreviewTable = {title: string; headers: string[]; rows: string[][]};

export function previewTablesFromFiles(files: ExportFile[], limit = PREVIEW_ROWS): PreviewTable[] {
    const decoder = new TextDecoder();
    return files.map((file) => {
        const [headers = [], ...rows] = parseCsv(decoder.decode(file.bytes));
        return {title: file.fileName, headers, rows: rows.slice(0, limit)};
    });
}

export const SAVE_FILTERS: Record<ExportFormat, {name: string; extensions: string[]}> = {
    xlsx: {name: "Excel workbook", extensions: ["xlsx"]},
    csv: {name: "CSV file", extensions: ["csv"]},
    pdf: {name: "PDF document", extensions: ["pdf"]},
    json: {name: "JSON backup", extensions: ["json"]},
};

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Last path segment, for either separator. */
export function baseName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
}

const DATASET_LIST_KEYS = ["manual_entries", "activity_sessions", "activity_logs", "devices", "activity_categories", "manual_categories", "app_groups", "skipped_apps"] as const;

/** A dataset containing only `key` (first `limit` rows); every other list is empty. */
export function onlyDataset(dataset: ExportDataset, key: (typeof DATASET_LIST_KEYS)[number], limit = PREVIEW_ROWS): ExportDataset {
    const result = {...dataset};
    for (const item of DATASET_LIST_KEYS) (result as Record<string, unknown>)[item] = item === key ? dataset[key].slice(0, limit) : [];
    return result;
}
