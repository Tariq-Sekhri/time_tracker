import type {ExportDataset, ExportInclude, ImportManualEntry, ImportRequest} from "../api/dataTransfer.ts";

/*
 * Shared contract for the import/export feature.
 *   formats/*   (pure, unit-tested) turn an ExportDataset + ExportOptions into file bytes,
 *               and parse imported files into ImportRequests.
 *   ui/*        renders Settings → Import & export and calls the functions below.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf" | "json";

/** Compatibility layout for manual time in CSV/Excel. "native" is this app's own layout. */
export type FrameworkId = "native" | "clockify" | "toggl" | "harvest";

/** Tabular datasets a user can export (JSON exports everything included regardless). */
export type DatasetKey = keyof ExportInclude;

export type DurationFormat = "hms" | "hm" | "decimal";
export type TimeFormat = "24h" | "12h";
export type DateFormat = "iso" | "us" | "eu";
export type CsvDelimiter = "," | ";" | "\t";
/** Minutes to round each entry's duration to (0 = exact). Applied to durations and totals, never to start/end times. */
export type Rounding = 0 | 1 | 5 | 6 | 10 | 15 | 30 | 60;
export type RoundingMode = "nearest" | "up" | "down";

/** Optional summary added to Excel (as a "Summary" sheet) and PDF. */
export type SummaryGrouping = "none" | "day" | "week" | "category" | "device";

export type PdfSections = {
    /** KPI tiles: total time, manual, activity, active days, daily average. */
    overview: boolean;
    /** Horizontal bar chart + table of time per category. */
    categoryBreakdown: boolean;
    /** Column chart + table of time per day. */
    dailyBreakdown: boolean;
    /** Time per device (activity only). */
    deviceBreakdown: boolean;
    /** Itemised tables of the included datasets, grouped by summaryGrouping when it is not "none". */
    detail: boolean;
    /** Line at the end for an approver signature and date. */
    signature: boolean;
};

export type ExportOptions = {
    format: ExportFormat;
    framework: FrameworkId;
    /** Column keys per dataset, in output order. Missing dataset = that dataset's default columns. */
    columns: Partial<Record<DatasetKey, string[]>>;
    durationFormat: DurationFormat;
    timeFormat: TimeFormat;
    dateFormat: DateFormat;
    csvDelimiter: CsvDelimiter;
    /** Prepend a UTF-8 BOM so Excel opens accented characters correctly. */
    csvBom: boolean;
    rounding: Rounding;
    roundingMode: RoundingMode;
    summaryGrouping: SummaryGrouping;
    /** Used by framework layouts that require a user (Clockify/Toggl email, Harvest first/last name). */
    userName: string;
    userEmail: string;
    /** PDF only. */
    pdf: {
        title: string;
        /** e.g. company or freelancer name, shown top-left. */
        preparedBy: string;
        /** e.g. client name, shown under the title. */
        preparedFor: string;
        orientation: "portrait" | "landscape";
        pageSize: "a4" | "letter";
        sections: PdfSections;
        /** Accent color used for header band and charts' fallback. Hex. */
        accentColor: string;
    };
};

/** One output file. CSV with several tabular datasets produces one file per dataset; the UI then asks for a folder instead of a file name. */
export type ExportFile = {
    /** Suggested file name without directory, with extension. */
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
};

/** Column metadata used by the UI's column picker. */
export type ColumnDef = {
    key: string;
    label: string;
    /** Selected when the user has not customised columns. */
    defaultOn: boolean;
    required?: boolean;
};

/** formats/index.ts must export these. */
export interface ExportFormatsModule {
    /** Columns available for a dataset in a framework layout (framework only affects manual_entries; others always native). */
    columnsFor(dataset: DatasetKey, framework: FrameworkId): ColumnDef[];
    /** Builds the file(s). Heavy libraries (exceljs, jspdf) are dynamically imported inside. */
    buildExport(dataset: ExportDataset, options: ExportOptions): Promise<ExportFile[]>;
    defaultExportOptions(): ExportOptions;
}

/** Fields an imported tabular row can be mapped to. */
export type ImportField =
    | "title"
    | "notes"
    | "category"
    | "subcategory"
    | "client"
    | "start_date"
    | "start_time"
    | "start_datetime"
    | "end_date"
    | "end_time"
    | "end_datetime"
    | "duration"
    | "date";

export type ImportFieldDef = {field: ImportField; label: string; help: string};

/** column index in the parsed table for each mapped field; unmapped fields are absent. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

/** How a Client column (Clockify/Toggl/Harvest) is treated. */
export type ClientHandling = "ignore" | "as_parent_category";

export type ParsedTable = {
    /** Sheet name for Excel, file name for CSV. */
    name: string;
    headers: string[];
    rows: string[][];
};

export type ParsedImportFile =
    | {kind: "table"; fileName: string; tables: ParsedTable[]; detectedFramework: FrameworkId | null}
    /** Our own JSON export. request is fully populated (dry_run true), sections counted in UI. */
    | {kind: "backup"; fileName: string; request: ImportRequest; generatedAt: number | null; rangeStart: number | null; rangeEnd: number | null};

export type ImportTableOptions = {
    mapping: ColumnMapping;
    clientHandling: ClientHandling;
    /** Date order for ambiguous dates like 03/04/2026. */
    dateFormat: "auto" | DateFormat;
    /** For Harvest-style rows with only a date + duration: local hour (0-23) the first entry of each day starts at; later entries stack after it. */
    dayStartHour: number;
    /** Category path used for rows without a category ([] = Uncategorized). */
    fallbackCategory: string[];
};

export type ConvertedRow = {
    /** Row index within ParsedTable.rows. */
    row: number;
    /** null when the row could not be converted. */
    entry: ImportManualEntry | null;
    error: string | null;
};

/** formats/index.ts must export these too. */
export interface ImportFormatsModule {
    parseImportFile(fileName: string, bytes: Uint8Array): Promise<ParsedImportFile>;
    importFieldDefs(): ImportFieldDef[];
    /** Best-guess mapping from headers (handles native, Clockify, Toggl, Harvest and common synonyms). */
    guessMapping(headers: string[], framework: FrameworkId | null): ColumnMapping;
    convertRows(table: ParsedTable, options: ImportTableOptions): ConvertedRow[];
}
