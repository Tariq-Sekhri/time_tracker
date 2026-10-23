import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ColumnDef, DatasetKey, ExportOptions, FrameworkId} from "../../types.ts";
import {dayKey} from "../shared.ts";
import type {Cell} from "./cells.ts";
import {type AnyColumnSpec, cellContext, type ColumnSpec, DATASET_ORDER, DATASET_TITLES, type DatasetRows, NATIVE_COLUMNS} from "./columns.ts";
import {FRAMEWORK_COLUMNS} from "./frameworks.ts";

export type ResolvedColumn = {
    key: string;
    header: string;
    total: boolean;
    wrap: boolean;
};

export type Table = {
    dataset: DatasetKey;
    title: string;
    /** Framework the table is laid out for (manual_entries only, otherwise "native"). */
    framework: FrameworkId;
    columns: ResolvedColumn[];
    rows: Cell[][];
};

/** Effective layout: frameworks only change manual entries. */
export function layoutFor(dataset: DatasetKey, framework: FrameworkId): FrameworkId {
    return dataset === "manual_entries" ? framework : "native";
}

export function columnSpecs<K extends DatasetKey>(dataset: K, framework: FrameworkId): ColumnSpec<DatasetRows[K]>[] {
    const layout = layoutFor(dataset, framework);
    if (layout !== "native") return FRAMEWORK_COLUMNS[layout] as unknown as ColumnSpec<DatasetRows[K]>[];
    return NATIVE_COLUMNS[dataset] as ColumnSpec<DatasetRows[K]>[];
}

export function columnsFor(dataset: DatasetKey, framework: FrameworkId): ColumnDef[] {
    return columnSpecs(dataset, framework).map(({key, label, defaultOn, required}) => ({key, label, defaultOn, ...(required ? {required} : {})}));
}

/** Keys a framework layout needs for the target tool to accept the file. Empty for native. */
export function requiredColumns(dataset: DatasetKey, framework: FrameworkId): string[] {
    if (layoutFor(dataset, framework) === "native") return [];
    return columnSpecs(dataset, framework).filter((spec) => spec.required).map((spec) => spec.key);
}

/** User's column selection (unknown keys dropped, duplicates removed) or the defaults. */
export function selectedSpecs<K extends DatasetKey>(dataset: K, options: ExportOptions): ColumnSpec<DatasetRows[K]>[] {
    const specs = columnSpecs(dataset, options.framework);
    const chosen = options.columns[dataset];
    if (chosen) {
        const byKey = new Map(specs.map((spec) => [spec.key, spec]));
        const picked = [...new Set(chosen)].map((key) => byKey.get(key)).filter((spec): spec is ColumnSpec<DatasetRows[K]> => !!spec);
        if (picked.length) return picked;
    }
    return specs.filter((spec) => spec.defaultOn);
}

/** Rows of a dataset, time-based ones sorted chronologically. */
export function datasetRows<K extends DatasetKey>(data: ExportDataset, dataset: K): DatasetRows[K][] {
    switch (dataset) {
        case "manual_entries":
            return [...data.manual_entries].sort((a, b) => a.start_time - b.start_time || a.id - b.id) as DatasetRows[K][];
        case "activity_sessions":
            return [...data.activity_sessions].sort((a, b) => a.start_time - b.start_time || a.device_name.localeCompare(b.device_name)) as DatasetRows[K][];
        case "activity_logs":
            return [...data.activity_logs].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id) as DatasetRows[K][];
        case "skipped_apps":
            return data.skipped_apps.map((regex) => ({regex})) as DatasetRows[K][];
        default:
            return data[dataset] as DatasetRows[K][];
    }
}

export function buildTable(data: ExportDataset, dataset: DatasetKey, options: ExportOptions): Table {
    const specs = selectedSpecs(dataset, options) as AnyColumnSpec[];
    const ctx = cellContext(options);
    const rows = datasetRows(data, dataset) as never[];
    return {
        dataset,
        title: DATASET_TITLES[dataset],
        framework: layoutFor(dataset, options.framework),
        columns: specs.map((spec) => ({key: spec.key, header: spec.header ?? spec.label, total: !!spec.total, wrap: !!spec.wrap})),
        rows: rows.map((row) => specs.map((spec) => spec.get(row, ctx))),
    };
}

/**
 * Datasets to output. ExportDataset leaves arrays empty when their include flag is off, so
 * a dataset is exported when it has rows; when nothing has rows, manual entries are exported
 * as a header-only table so the user still gets a valid file.
 */
export function tabularDatasets(data: ExportDataset): DatasetKey[] {
    const withRows = DATASET_ORDER.filter((key) => data[key].length > 0);
    return withRows.length ? withRows : ["manual_entries"];
}

/** "2026-03-01_to_2026-03-31" (range end is exclusive). */
export function rangeStem(data: ExportDataset): string {
    const end = data.range_end > data.range_start ? data.range_end - 1 : data.range_end;
    return `${dayKey(data.range_start)}_to_${dayKey(end)}`;
}

/** time-tracker-manual-entries[-clockify]-2026-03-01_to_2026-03-31.csv */
export function datasetFileName(data: ExportDataset, dataset: DatasetKey, framework: FrameworkId, extension: string): string {
    const layout = layoutFor(dataset, framework);
    const suffix = layout === "native" ? "" : `-${layout}`;
    return `time-tracker-${dataset.replace(/_/g, "-")}${suffix}-${rangeStem(data)}.${extension}`;
}

export function fileName(data: ExportDataset, stem: string, extension: string): string {
    return `time-tracker-${stem}-${rangeStem(data)}.${extension}`;
}
