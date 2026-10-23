import type {Borders, Cell as XCell, Fill, Font, Workbook, Worksheet} from "exceljs";
import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {DateFormat, DurationFormat, ExportFile, ExportOptions, TimeFormat} from "../../types.ts";
import {rangeLabel} from "../shared.ts";
import {type Cell, cellText} from "./cells.ts";
import {FRAMEWORK_LABELS} from "./frameworks.ts";
import {type ExportSummary, GROUPING_LABELS, KIND_LABELS, summarize} from "./summary.ts";
import {buildTable, fileName, type Table, tabularDatasets} from "./table.ts";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type ExcelJSModule = typeof import("exceljs");

/** exceljs is CommonJS (node) / UMD (browser build picked by Vite); normalise the namespace. */
async function loadExcelJS(): Promise<ExcelJSModule> {
    const mod = await import("exceljs");
    return ((mod as unknown as {default?: ExcelJSModule}).default ?? mod) as ExcelJSModule;
}

const DEFAULT_ACCENT = "#2563eb";
const HEADER_FONT_COLOR = "FFFFFFFF";
const BORDER_COLOR = "FFD1D5DB";
const TOTAL_FILL = "FFF3F4F6";
const MAX_WIDTH = 60;
const MIN_WIDTH = 8;
const WIDTH_SAMPLE_ROWS = 2000;

/** "#2563eb" / "#26e" / "2563eb" → "FF2563EB"; null when not a hex color. */
export function hexToArgb(hex: string | null | undefined): string | null {
    if (!hex) return null;
    let value = hex.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(value)) value = value.replace(/./g, (c) => c + c);
    if (/^[0-9a-f]{8}$/i.test(value)) value = value.slice(0, 6);
    return /^[0-9a-f]{6}$/i.test(value) ? `FF${value.toUpperCase()}` : null;
}

/** Black or white text for legibility on an ARGB fill. */
function contrastArgb(argb: string): string {
    const r = parseInt(argb.slice(2, 4), 16);
    const g = parseInt(argb.slice(4, 6), 16);
    const b = parseInt(argb.slice(6, 8), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "FF111827" : "FFFFFFFF";
}

const solid = (argb: string): Fill => ({type: "pattern", pattern: "solid", fgColor: {argb}});

/**
 * Excel stores wall-clock date/times without a zone and exceljs serialises a Date via its UTC
 * value, so the local components of the timestamp are placed into a UTC Date.
 */
export function excelDateTime(ts: number): Date {
    const d = new Date(ts * 1000);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
}

export function excelDate(ts: number): Date {
    const d = new Date(ts * 1000);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

const DATE_FORMATS: Record<DateFormat, string> = {iso: "yyyy-mm-dd", us: "mm/dd/yyyy", eu: "dd/mm/yyyy"};

function timeNumFmt(format: TimeFormat, seconds: boolean, padHours: boolean): string {
    const secs = seconds ? ":ss" : "";
    if (format === "12h") return `${padHours ? "hh" : "h"}:mm${secs} AM/PM`;
    return `hh:mm${secs}`;
}

function durationNumFmt(format: DurationFormat, padHours = false): string {
    if (format === "decimal") return "0.00";
    const hours = padHours ? "[hh]" : "[h]";
    return format === "hm" ? `${hours}:mm` : `${hours}:mm:ss`;
}

/** Excel value: day fraction for clock formats, decimal hours for "decimal". */
function durationValue(seconds: number, format: DurationFormat): number {
    return format === "decimal" ? Math.round((seconds / 3600) * 1e6) / 1e6 : seconds / 86400;
}

/** Number format a cell kind uses (null = General). */
function numFmtOf(cell: Cell, options: ExportOptions): string | null {
    switch (cell.kind) {
        case "number":
            return cell.decimals ? `0.${"0".repeat(cell.decimals)}` : null;
        case "duration":
            return durationNumFmt(cell.format ?? options.durationFormat, cell.padHours);
        case "date":
            return DATE_FORMATS[cell.format ?? options.dateFormat];
        case "time":
            return timeNumFmt(cell.format ?? options.timeFormat, cell.seconds ?? true, cell.padHours ?? (cell.format ?? options.timeFormat) === "24h");
        case "datetime":
            return `${DATE_FORMATS[options.dateFormat]} ${timeNumFmt(options.timeFormat, true, options.timeFormat === "24h")}`;
        default:
            return null;
    }
}

/** Numeric Excel value of a cell (for totals). */
function excelNumber(cell: Cell, options: ExportOptions): number {
    if (cell.kind === "duration") return durationValue(cell.seconds, cell.format ?? options.durationFormat);
    if (cell.kind === "number") return cell.value;
    return 0;
}

function writeCell(target: XCell, cell: Cell, options: ExportOptions): void {
    switch (cell.kind) {
        case "text":
            target.value = cell.value;
            break;
        case "number":
            target.value = cell.value;
            break;
        case "duration":
            target.value = durationValue(cell.seconds, cell.format ?? options.durationFormat);
            break;
        case "date":
            target.value = excelDate(cell.ts);
            break;
        case "time":
        case "datetime":
            target.value = excelDateTime(cell.ts);
            break;
        case "bool":
            target.value = cell.value ? "Yes" : "No";
            target.alignment = {horizontal: "center"};
            break;
        case "color": {
            target.value = cell.value ?? "";
            const argb = hexToArgb(cell.value);
            if (argb) {
                target.fill = solid(argb);
                target.font = {color: {argb: contrastArgb(argb)}};
            }
            break;
        }
        case "empty":
            break;
    }
    const numFmt = numFmtOf(cell, options);
    if (numFmt) target.numFmt = numFmt;
}

function styleHeaderRow(ws: Worksheet, rowNumber: number, columnCount: number, accentArgb: string): void {
    const row = ws.getRow(rowNumber);
    row.height = 20;
    for (let c = 1; c <= columnCount; c++) {
        const cell = row.getCell(c);
        cell.font = {bold: true, color: {argb: HEADER_FONT_COLOR}};
        cell.fill = solid(accentArgb);
        cell.alignment = {vertical: "middle", horizontal: c === 1 ? "left" : "center"};
        cell.border = {bottom: {style: "thin", color: {argb: accentArgb}}};
    }
}

function styleTotalRow(ws: Worksheet, rowNumber: number, columnCount: number): void {
    const row = ws.getRow(rowNumber);
    const border: Partial<Borders> = {top: {style: "thin", color: {argb: "FF6B7280"}}, bottom: {style: "double", color: {argb: "FF6B7280"}}};
    for (let c = 1; c <= columnCount; c++) {
        const cell = row.getCell(c);
        cell.font = {bold: true};
        cell.fill = solid(TOTAL_FILL);
        cell.border = border;
    }
}

const columnLetter = (index: number): string => {
    let n = index;
    let letters = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        letters = String.fromCharCode(65 + rem) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
};

function sheetNameFor(table: Table): string {
    const base = table.framework === "native" ? table.title : `${table.title} (${FRAMEWORK_LABELS[table.framework]})`;
    return base.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

const TIME_BASED = new Set(["manual_entries", "activity_sessions", "activity_logs"]);

function addTableSheet(wb: Workbook, table: Table, options: ExportOptions, accentArgb: string): void {
    const columnCount = table.columns.length;
    const freezeFirst = TIME_BASED.has(table.dataset) && columnCount > 3;
    const ws = wb.addWorksheet(sheetNameFor(table), {
        views: [{state: "frozen", xSplit: freezeFirst ? 1 : 0, ySplit: 1}],
    });
    ws.pageSetup.orientation = columnCount > 6 ? "landscape" : "portrait";
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
    if (options.pdf.pageSize === "a4") ws.pageSetup.paperSize = 9;
    ws.pageSetup.printTitlesRow = "1:1";

    ws.getRow(1).values = table.columns.map((column) => column.header);
    styleHeaderRow(ws, 1, columnCount, accentArgb);

    table.rows.forEach((cells, index) => {
        const row = ws.getRow(index + 2);
        cells.forEach((cell, c) => {
            const target = row.getCell(c + 1);
            writeCell(target, cell, options);
            if (table.columns[c].wrap && cell.kind === "text" && cell.value.length > 50) {
                target.alignment = {wrapText: true, vertical: "top"};
            }
        });
    });

    const lastDataRow = table.rows.length + 1;
    ws.autoFilter = {from: {row: 1, column: 1}, to: {row: Math.max(1, lastDataRow), column: columnCount}};

    // Totals row: SUBTOTAL(109, …) so it follows the autofilter.
    const totalColumns = table.columns.map((column, c) => (column.total ? c : -1)).filter((c) => c >= 0);
    if (table.rows.length && totalColumns.length) {
        const totalRowNumber = lastDataRow + 1;
        const row = ws.getRow(totalRowNumber);
        const labelColumn = table.columns.findIndex((column) => !column.total);
        if (labelColumn >= 0) row.getCell(labelColumn + 1).value = "Total";
        for (const c of totalColumns) {
            const letter = columnLetter(c + 1);
            const result = table.rows.reduce((sum, cells) => sum + excelNumber(cells[c], options), 0);
            const cell = row.getCell(c + 1);
            cell.value = {formula: `SUBTOTAL(109,${letter}2:${letter}${lastDataRow})`, result};
            const numFmt = numFmtOf(table.rows[0][c], options);
            if (numFmt) cell.numFmt = numFmt;
        }
        styleTotalRow(ws, totalRowNumber, columnCount);
    }

    // Widths from content (sampled), capped.
    table.columns.forEach((column, c) => {
        let width = column.header.length;
        const sample = table.rows.length > WIDTH_SAMPLE_ROWS ? table.rows.slice(0, WIDTH_SAMPLE_ROWS) : table.rows;
        for (const cells of sample) {
            const cell = cells[c];
            const length = cell.kind === "date" ? 10 : cellText(cell, options).length;
            if (length > width) width = length;
        }
        ws.getColumn(c + 1).width = Math.max(MIN_WIDTH, Math.min(column.wrap ? 50 : MAX_WIDTH, width + 3));
    });
}

function addSummarySheet(wb: Workbook, data: ExportDataset, options: ExportOptions, accentArgb: string): void {
    const ws = wb.addWorksheet("Summary", {properties: {tabColor: {argb: accentArgb}}, views: [{showGridLines: false}]});
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
    if (options.pdf.pageSize === "a4") ws.pageSetup.paperSize = 9;
    ws.columns = [{width: 34}, {width: 16}, {width: 16}, {width: 16}, {width: 12}];

    const durationFmt = durationNumFmt(options.durationFormat);
    const dur = (seconds: number) => durationValue(seconds, options.durationFormat);
    const labelFont: Partial<Font> = {color: {argb: "FF6B7280"}};
    let r = 1;

    const title = ws.getCell(r, 1);
    title.value = options.pdf.title.trim() || "Time report";
    title.font = {bold: true, size: 18, color: {argb: accentArgb}};
    ws.mergeCells(r, 1, r, 5);
    ws.getRow(r).height = 28;
    r += 1;

    const info: [string, string | Date][] = [["Period", rangeLabel(data.range_start, data.range_end)]];
    if (options.pdf.preparedFor.trim()) info.push(["Prepared for", options.pdf.preparedFor.trim()]);
    if (options.pdf.preparedBy.trim()) info.push(["Prepared by", options.pdf.preparedBy.trim()]);
    else if (options.userName.trim()) info.push(["Prepared by", options.userName.trim()]);
    info.push(["Generated", excelDateTime(data.generated_at)]);
    if (options.rounding) info.push(["Rounding", `Each entry rounded ${options.roundingMode === "nearest" ? "to the nearest" : `${options.roundingMode} to`} ${options.rounding} min`]);
    for (const [label, value] of info) {
        ws.getCell(r, 1).value = label;
        ws.getCell(r, 1).font = labelFont;
        const cell = ws.getCell(r, 2);
        cell.value = value;
        if (value instanceof Date) {
            cell.numFmt = `${DATE_FORMATS[options.dateFormat]} ${timeNumFmt(options.timeFormat, false, options.timeFormat === "24h")}`;
            cell.alignment = {horizontal: "left"};
        }
        ws.mergeCells(r, 2, r, 5);
        r += 1;
    }
    r += 1;

    const overall = summarize(data, options, "none");
    const section = (label: string) => {
        const cell = ws.getCell(r, 1);
        cell.value = label;
        cell.font = {bold: true, size: 13};
        cell.border = {bottom: {style: "medium", color: {argb: accentArgb}}};
        for (let c = 2; c <= 5; c++) ws.getCell(r, c).border = {bottom: {style: "medium", color: {argb: accentArgb}}};
        r += 1;
    };

    section("Overview");
    const activityLabel = overall.activitySource === "logs" ? "Activity time (tracked)" : "Activity time (active)";
    const kpis: [string, number, "duration" | "count"][] = [
        ["Total time", overall.total, "duration"],
        ["Manual time", overall.manual, "duration"],
        [activityLabel, overall.activity, "duration"],
        ["Manual entries", overall.manualCount, "count"],
        [overall.activitySource === "logs" ? "Activity log entries" : "Activity sessions", overall.activityCount, "count"],
        ["Active days", overall.activeDays, "count"],
    ];
    if (overall.activeDays) kpis.push(["Average per active day", Math.round(overall.total / overall.activeDays), "duration"]);
    for (const [label, value, kind] of kpis) {
        ws.getCell(r, 1).value = label;
        const cell = ws.getCell(r, 2);
        cell.value = kind === "duration" ? dur(value) : value;
        if (kind === "duration") cell.numFmt = durationFmt;
        if (label === "Total time") {
            ws.getCell(r, 1).font = {bold: true};
            cell.font = {bold: true};
        }
        r += 1;
    }
    r += 1;

    const writeGroupTable = (summary: ExportSummary) => {
        const byCategory = summary.grouping === "category";
        section(`By ${GROUPING_LABELS[summary.grouping].toLowerCase()}`);
        const headers = byCategory
            ? ["Category", "Source", "Time", "Entries", "Share"]
            : [GROUPING_LABELS[summary.grouping], "Manual", "Activity", "Total", "Share"];
        ws.getRow(r).values = headers;
        styleHeaderRow(ws, r, 5, accentArgb);
        r += 1;
        const first = r;
        if (!summary.groups.length) {
            ws.getCell(r, 1).value = "No time in this period";
            ws.getCell(r, 1).font = labelFont;
            r += 1;
        }
        for (const group of summary.groups) {
            const row = ws.getRow(r);
            row.getCell(1).value = group.label;
            const argb = hexToArgb(group.color);
            if (argb) row.getCell(1).border = {left: {style: "thick", color: {argb}}};
            if (byCategory) {
                row.getCell(2).value = group.kind ? KIND_LABELS[group.kind] : "";
                row.getCell(3).value = dur(group.total);
                row.getCell(3).numFmt = durationFmt;
                row.getCell(4).value = group.manualCount + group.activityCount;
            } else {
                [group.manual, group.activity, group.total].forEach((seconds, i) => {
                    row.getCell(2 + i).value = dur(seconds);
                    row.getCell(2 + i).numFmt = durationFmt;
                });
            }
            row.getCell(5).value = summary.total ? group.total / summary.total : 0;
            row.getCell(5).numFmt = "0.0%";
            for (let c = 1; c <= 5; c++) {
                const cell = row.getCell(c);
                cell.border = {...cell.border, bottom: {style: "hair", color: {argb: BORDER_COLOR}}};
            }
            r += 1;
        }
        const last = r - 1;
        const total = ws.getRow(r);
        total.getCell(1).value = "TOTAL";
        const sumCell = (column: number, result: number, numFmt: string) => {
            const letter = columnLetter(column);
            const cell = total.getCell(column);
            cell.value = summary.groups.length ? {formula: `SUM(${letter}${first}:${letter}${last})`, result} : result;
            cell.numFmt = numFmt;
        };
        if (byCategory) {
            sumCell(3, dur(summary.total), durationFmt);
            sumCell(4, summary.manualCount + summary.activityCount, "0");
        } else {
            sumCell(2, dur(summary.manual), durationFmt);
            sumCell(3, dur(summary.activity), durationFmt);
            sumCell(4, dur(summary.total), durationFmt);
        }
        sumCell(5, summary.total ? 1 : 0, "0.0%");
        styleTotalRow(ws, r, 5);
        r += 2;
    };

    if (options.summaryGrouping !== "none") writeGroupTable(summarize(data, options));
    if (options.summaryGrouping !== "category") writeGroupTable(summarize(data, options, "category"));

    const note = ws.getCell(r, 1);
    note.value =
        "Manual time is the duration of manual entries. Activity time is the active (tracked) time inside activity " +
        `${overall.activitySource === "logs" ? "log entries" : "sessions"}.` +
        (options.rounding ? " Totals are sums of individually rounded entries." : "");
    note.font = {italic: true, size: 9, color: {argb: "FF6B7280"}};
    note.alignment = {wrapText: true, vertical: "top"};
    ws.mergeCells(r, 1, r, 5);
    ws.getRow(r).height = 30;
}

export async function buildXlsxFile(data: ExportDataset, options: ExportOptions): Promise<ExportFile> {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const generated = new Date(data.generated_at * 1000);
    wb.creator = "Time Tracker";
    wb.lastModifiedBy = "Time Tracker";
    wb.created = generated;
    wb.modified = generated;
    wb.title = options.pdf.title.trim() || "Time report";
    wb.subject = rangeLabel(data.range_start, data.range_end);
    wb.calcProperties.fullCalcOnLoad = true;

    const accentArgb = hexToArgb(options.pdf.accentColor) ?? (hexToArgb(DEFAULT_ACCENT) as string);
    addSummarySheet(wb, data, options, accentArgb);
    for (const dataset of tabularDatasets(data)) addTableSheet(wb, buildTable(data, dataset, options), options, accentArgb);

    const buffer = await wb.xlsx.writeBuffer();
    return {
        fileName: fileName(data, "export", "xlsx"),
        mimeType: XLSX_MIME,
        bytes: new Uint8Array(buffer as ArrayBuffer),
    };
}
