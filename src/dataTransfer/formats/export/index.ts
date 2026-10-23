import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ColumnDef, DatasetKey, ExportFile, ExportOptions, FrameworkId} from "../../types.ts";
import {buildCsvFiles} from "./csv.ts";
import {buildJsonFile} from "./json.ts";
import {columnsFor as tableColumnsFor} from "./table.ts";

export {FRAMEWORK_LABELS, FRAMEWORK_NOTES} from "./frameworks.ts";
export {JSON_EXPORT_FORMAT, JSON_EXPORT_VERSION, type JsonExport} from "./json.ts";
export {requiredColumns} from "./table.ts";
export {summarize, type ExportSummary, type SummaryGroup, type SummaryKind} from "./summary.ts";

/** Columns available for a dataset; the framework only changes manual_entries. */
export function columnsFor(dataset: DatasetKey, framework: FrameworkId): ColumnDef[] {
    return tableColumnsFor(dataset, framework);
}

export async function buildExport(dataset: ExportDataset, options: ExportOptions): Promise<ExportFile[]> {
    switch (options.format) {
        case "csv":
            return buildCsvFiles(dataset, options);
        case "xlsx": {
            const {buildXlsxFile} = await import("./xlsx.ts");
            return [await buildXlsxFile(dataset, options)];
        }
        case "json":
            return [buildJsonFile(dataset)];
        case "pdf": {
            const {buildPdfReport} = await import("./pdf.ts");
            return [await buildPdfReport(dataset, options)];
        }
    }
}

export function defaultExportOptions(): ExportOptions {
    return {
        format: "xlsx",
        framework: "native",
        columns: {},
        durationFormat: "hms",
        timeFormat: "24h",
        dateFormat: "iso",
        csvDelimiter: ",",
        csvBom: true,
        rounding: 0,
        roundingMode: "nearest",
        summaryGrouping: "category",
        userName: "",
        userEmail: "",
        pdf: {
            title: "Time report",
            preparedBy: "",
            preparedFor: "",
            orientation: "portrait",
            pageSize: "a4",
            sections: {
                overview: true,
                categoryBreakdown: true,
                dailyBreakdown: true,
                deviceBreakdown: true,
                detail: true,
                signature: false,
            },
            accentColor: "#2563eb",
        },
    };
}
