import type {ParsedTable} from "../../types.ts";
import {ImportFileError} from "./text.ts";
import {buildTable} from "./table.ts";

/** Sheets that only summarise other sheets. They stay selectable but are moved after the data sheets. */
const SUMMARY_SHEET = /^(summary|overview|totals?|report|info|about|cover|dashboard)\b/i;

type Cell = {text: string; isText: boolean};

const MS_PER_DAY = 86_400_000;
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

/**
 * Parses every non-empty worksheet into a table. exceljs is loaded lazily.
 * Data sheets come first; sheets named like "Summary" are kept but moved last
 * (unless every sheet is a summary sheet) so the UI's default selection is the detail data.
 */
export async function parseXlsx(bytes: Uint8Array): Promise<ParsedTable[]> {
    const ExcelJS = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    try {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        await workbook.xlsx.load(buffer);
    } catch (error) {
        throw new ImportFileError(`Couldn't open the Excel file (${error instanceof Error ? error.message : String(error)}). Try re-saving it as .xlsx or CSV.`);
    }
    const date1904 = Boolean((workbook.properties as {date1904?: boolean} | undefined)?.date1904);

    const tables: ParsedTable[] = [];
    workbook.eachSheet((sheet) => {
        const rows: Cell[][] = [];
        for (let r = 1; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            const cells: Cell[] = [];
            for (let c = 1; c <= row.cellCount; c++) {
                const cell = row.getCell(c);
                cells.push(cellToString(cell.value, cell.numFmt, date1904));
            }
            rows.push(cells);
        }
        const headerIndex = findHeaderRow(rows);
        if (headerIndex < 0) return;
        const table = buildTable(sheet.name, rows.slice(headerIndex).map((cells) => cells.map((cell) => cell.text)), false);
        if (table) tables.push(table);
    });

    const data = tables.filter((t) => !SUMMARY_SHEET.test(t.name));
    const summaries = tables.filter((t) => SUMMARY_SHEET.test(t.name));
    return [...data, ...summaries];
}

async function loadExcelJs() {
    const module = await import("exceljs");
    return ((module as unknown as {default?: typeof module}).default ?? module) as typeof import("exceljs");
}

/** First row with at least two non-empty text cells (skips report titles above the header); else the first non-empty row; -1 when empty. */
export function findHeaderRow(rows: Cell[][]): number {
    const textRow = rows.findIndex((cells) => cells.filter((cell) => cell.isText && cell.text.trim()).length >= 2);
    if (textRow >= 0) return textRow;
    return rows.findIndex((cells) => cells.some((cell) => cell.text.trim()));
}

/** Converts an exceljs cell value to display text. Exported for tests. */
export function cellToString(value: unknown, numFmt: string | undefined, date1904: boolean): Cell {
    if (value === null || value === undefined) return {text: "", isText: false};
    if (typeof value === "string") return {text: value, isText: true};
    if (typeof value === "number") {
        if (isDateFormat(numFmt)) return {text: serialToText(value, numFmt, date1904), isText: false};
        return {text: formatNumber(value), isText: false};
    }
    if (typeof value === "boolean") return {text: value ? "TRUE" : "FALSE", isText: false};
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return {text: "", isText: false};
        const serial = (value.getTime() - (date1904 ? EPOCH_1904 : EPOCH_1900)) / MS_PER_DAY;
        return {text: serialToText(serial, numFmt, date1904), isText: false};
    }
    if (typeof value === "object") {
        const v = value as Record<string, unknown>;
        if (Array.isArray(v.richText)) {
            return {text: v.richText.map((part) => (part as {text?: unknown})?.text ?? "").join(""), isText: true};
        }
        if ("formula" in v || "sharedFormula" in v || "result" in v) {
            return cellToString(v.result, numFmt, date1904);
        }
        if ("text" in v) {
            const inner = v.text;
            if (typeof inner === "string") return {text: inner, isText: true};
            return cellToString(inner, numFmt, date1904);
        }
        if ("error" in v) return {text: "", isText: false};
    }
    return {text: String(value), isText: false};
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(15)));
}

/** Removes quoted literals, escapes and bracketed codes except elapsed-time codes like [h]. */
function stripFormat(numFmt: string): string {
    return numFmt.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[(?![hms]+\])[^\]]*\]/gi, "");
}

function isDateFormat(numFmt: string | undefined): boolean {
    if (!numFmt) return false;
    return /[ymdhs]/i.test(stripFormat(numFmt));
}

/**
 * Excel serial → text. Formats without a date part (h:mm, [h]:mm:ss) are times of day or durations → "H:MM:SS".
 * Otherwise "YYYY-MM-DD" plus " HH:MM:SS" when the format shows a time or the time part is non-zero.
 * exceljs decodes date cells as UTC, so UTC components are the wall-clock values shown in Excel.
 */
function serialToText(serial: number, numFmt: string | undefined, date1904: boolean): string {
    const stripped = numFmt ? stripFormat(numFmt) : "";
    const hasDate = /[yd]/i.test(stripped) || /mmm/i.test(stripped);
    const hasTime = /[hs]/i.test(stripped);
    if (numFmt ? !hasDate : serial >= 0 && serial < 1) {
        // A time-of-day cell may carry a full calendar date (our exporter does this).
        // Excel displays only the fractional day unless an elapsed-time [h]/[m]/[s] format is used.
        const elapsed = /\[[hms]+\]/i.test(stripped);
        const value = elapsed ? serial : ((serial % 1) + 1) % 1;
        const total = Math.round(value * 86400);
        const sign = total < 0 ? "-" : "";
        const abs = Math.abs(total);
        return `${sign}${Math.floor(abs / 3600)}:${pad2(Math.floor((abs % 3600) / 60))}:${pad2(abs % 60)}`;
    }
    const date = new Date(Math.round(((date1904 ? EPOCH_1904 : EPOCH_1900) + serial * MS_PER_DAY) / 1000) * 1000);
    const day = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    const timeNonZero = date.getUTCHours() || date.getUTCMinutes() || date.getUTCSeconds();
    if (!hasTime && !timeNonZero) return day;
    return `${day} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

const pad2 = (value: number) => String(value).padStart(2, "0");
