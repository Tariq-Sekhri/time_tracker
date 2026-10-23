import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ExportFile, ExportOptions} from "../../types.ts";
import {type Cell, cellText, num, text} from "./cells.ts";
import {type ExportSummary, GROUPING_LABELS, KIND_LABELS, summarize} from "./summary.ts";
import {buildTable, datasetFileName, fileName, type Table, tabularDatasets} from "./table.ts";

export const CSV_MIME = "text/csv";

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/** RFC 4180 field: quoted when it contains the delimiter, a quote, CR or LF; quotes doubled. */
export function csvField(value: string, delimiter: string): string {
    if (value.includes(delimiter) || /["\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

/**
 * Text of a cell for CSV. User-provided text starting with = + - @ (or tab / CR) is prefixed with
 * an apostrophe so spreadsheet apps don't evaluate it as a formula. Values we format ourselves
 * (numbers, durations, dates) are never prefixed.
 */
export function csvCellText(cell: Cell, options: ExportOptions): string {
    const value = cellText(cell, options);
    return cell.kind === "text" && FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
}

/** CSV text (CRLF line endings, trailing CRLF) for headers + typed rows. */
export function toCsv(headers: string[], rows: Cell[][], options: ExportOptions): string {
    const delimiter = options.csvDelimiter;
    const lines = [
        headers.map((header) => csvField(header, delimiter)).join(delimiter),
        ...rows.map((row) => row.map((cell) => csvField(csvCellText(cell, options), delimiter)).join(delimiter)),
    ];
    return lines.join("\r\n") + "\r\n";
}

export function tableToCsv(table: Table, options: ExportOptions): string {
    return toCsv(
        table.columns.map((column) => column.header),
        table.rows,
        options,
    );
}

/** UTF-8 bytes, with a BOM when requested (Excel then detects UTF-8). */
export function encodeCsv(csv: string, bom: boolean): Uint8Array {
    return new TextEncoder().encode(bom ? `﻿${csv}` : csv);
}

const percent = (part: number, whole: number): Cell => text(whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0.0%");

/** Grouped totals as headers + rows, ending with a TOTAL row. */
export function summaryRows(summary: ExportSummary): {headers: string[]; rows: Cell[][]} {
    const duration = (seconds: number): Cell => ({kind: "duration", seconds});
    if (summary.grouping === "category") {
        return {
            headers: ["Category", "Source", "Duration", "Entries", "Share"],
            rows: [
                ...summary.groups.map((g) => [
                    text(g.label),
                    text(g.kind ? KIND_LABELS[g.kind] : ""),
                    duration(g.total),
                    num(g.manualCount + g.activityCount),
                    percent(g.total, summary.total),
                ]),
                [text("TOTAL"), text(""), duration(summary.total), num(summary.manualCount + summary.activityCount), percent(summary.total, summary.total)],
            ],
        };
    }
    return {
        headers: [GROUPING_LABELS[summary.grouping], "Manual", "Activity", "Total", "Share"],
        rows: [
            ...summary.groups.map((g) => [text(g.label), duration(g.manual), duration(g.activity), duration(g.total), percent(g.total, summary.total)]),
            [text("TOTAL"), duration(summary.manual), duration(summary.activity), duration(summary.total), percent(summary.total, summary.total)],
        ],
    };
}

export function buildCsvFiles(data: ExportDataset, options: ExportOptions): ExportFile[] {
    const files: ExportFile[] = tabularDatasets(data).map((dataset) => ({
        fileName: datasetFileName(data, dataset, options.framework, "csv"),
        mimeType: CSV_MIME,
        bytes: encodeCsv(tableToCsv(buildTable(data, dataset, options), options), options.csvBom),
    }));
    if (options.summaryGrouping !== "none") {
        const {headers, rows} = summaryRows(summarize(data, options));
        files.push({
            fileName: fileName(data, `summary-by-${options.summaryGrouping}`, "csv"),
            mimeType: CSV_MIME,
            bytes: encodeCsv(toCsv(headers, rows, options), options.csvBom),
        });
    }
    return files;
}
