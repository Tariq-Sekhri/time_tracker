import type {FrameworkId} from "../../types.ts";
import {fileExtension, ImportFileError, normalizeHeader} from "./text.ts";

export type FileKind = "csv" | "xlsx" | "json";

const CSV_EXTENSIONS = new Set(["csv", "tsv", "txt", "tab"]);
const XLSX_EXTENSIONS = new Set(["xlsx", "xlsm"]);

const isZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
/** OLE2 compound file: legacy .xls (and .doc etc.). */
const isOle = (b: Uint8Array) => b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

const LEGACY_XLS = "Old Excel files (.xls) can't be read. Open the file in Excel (or LibreOffice / Google Sheets) and save it as .xlsx or CSV, then import that file.";

/**
 * Decides how to parse a file. A zip signature always means .xlsx (whatever the extension),
 * then the extension decides, then content sniffing (leading "{" → JSON, otherwise CSV).
 */
export function detectFileKind(fileName: string, bytes: Uint8Array): FileKind {
    if (isZip(bytes)) return "xlsx";
    const ext = fileExtension(fileName);
    if (ext === "xls" || isOle(bytes)) throw new ImportFileError(LEGACY_XLS);
    if (XLSX_EXTENSIONS.has(ext)) throw new ImportFileError("This file has an .xlsx name but isn't a valid Excel workbook. Re-save it from Excel, or export it as CSV.");
    if (ext === "json") return "json";
    if (CSV_EXTENSIONS.has(ext)) return "csv";
    return firstNonSpaceChar(bytes) === "{" ? "json" : "csv";
}

function firstNonSpaceChar(bytes: Uint8Array): string {
    let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    for (; i < Math.min(bytes.length, 1024); i++) {
        const c = String.fromCharCode(bytes[i]);
        if (c.trim()) return c;
    }
    return "";
}

/**
 * Detects the app a CSV / sheet was exported from by its headers (case, spaces and punctuation ignored).
 * Clockify: "Duration (h)" / "Duration (decimal)" (or "Time (h)") plus a start date, or its import template ("Tag").
 * Toggl Track: "Start date" + "Start time" + plain "Duration".
 * Harvest: "Date" + "Hours" (+ Notes / Project / Task / First name).
 * Native: our own layout ("Title" + start, or "Parent category" / "Category path").
 */
export function detectFramework(headers: string[]): FrameworkId | null {
    const h = new Set(headers.map(normalizeHeader));
    const has = (...names: string[]) => names.some((name) => h.has(name));
    const describes = has("description", "project", "task");

    if (has("durationh", "durationdecimal", "timeh", "timedecimal") && has("startdate", "date") && describes) return "clockify";
    // Clockify's import template (also what our Clockify layout writes): "Tag" (singular) instead of Toggl's "Tags".
    if (has("tag") && !has("tags") && has("startdate") && has("starttime") && has("duration") && describes) return "clockify";
    if (has("startdate") && has("starttime") && has("duration") && describes) return "toggl";
    if (has("date", "spentdate") && has("hours") && has("notes", "project", "task", "firstname", "lastname")) return "harvest";
    if (has("categorypath", "parentcategory") || (has("title") && has("start", "starttime", "startdatetime", "date", "startdate"))) return "native";
    return null;
}
