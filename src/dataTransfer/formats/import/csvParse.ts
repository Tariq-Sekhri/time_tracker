import type {ParsedTable} from "../../types.ts";
import {buildTable} from "./table.ts";

export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;

const SNIFF_RECORDS = 20;
const SNIFF_CHARS = 64 * 1024;

/**
 * Picks the delimiter whose count is non-zero in the first record and most consistent across the
 * first records (quotes respected, so delimiters inside quoted fields don't count). Ties go to the
 * higher count in the header, then to `preferred`, then to the order of CSV_DELIMITERS.
 */
export function sniffDelimiter(text: string, preferred?: string): string {
    const records: Record<string, number>[] = [];
    let counts = emptyCounts();
    let inQuotes = false;
    let hasContent = false;
    const limit = Math.min(text.length, SNIFF_CHARS);
    for (let i = 0; i < limit && records.length < SNIFF_RECORDS; i++) {
        const c = text[i];
        if (c === '"') {
            inQuotes = !inQuotes;
            hasContent = true;
        } else if (!inQuotes && (c === "\n" || c === "\r")) {
            if (hasContent) records.push(counts);
            counts = emptyCounts();
            hasContent = false;
        } else if (!inQuotes && c in counts) {
            counts[c]++;
            hasContent = true;
        } else if (c.trim()) {
            hasContent = true;
        }
    }
    if (hasContent && records.length < SNIFF_RECORDS) records.push(counts);
    if (!records.length) return preferred ?? ",";

    let best = preferred ?? ",";
    let bestScore = -1;
    const candidates = preferred ? [preferred, ...CSV_DELIMITERS.filter((d) => d !== preferred)] : [...CSV_DELIMITERS];
    for (const delimiter of candidates) {
        const headerCount = records[0][delimiter] ?? 0;
        if (!headerCount) continue;
        const consistent = records.filter((r) => r[delimiter] === headerCount).length / records.length;
        const score = consistent * 1000 + Math.min(headerCount, 999);
        if (score > bestScore) {
            bestScore = score;
            best = delimiter;
        }
    }
    return best;
}

function emptyCounts(): Record<string, number> {
    return {",": 0, ";": 0, "\t": 0, "|": 0};
}

/**
 * RFC 4180 parser: quoted fields, "" escapes, delimiters and newlines inside quotes, CRLF / LF / CR
 * line endings. Lenient: a quote in the middle of an unquoted field is kept literally, and text
 * after a closing quote is appended to the field.
 */
export function parseCsv(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let started = false;
    let inQuotes = false;
    const n = text.length;
    let i = 0;
    while (i < n) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            field += c;
            i++;
            continue;
        }
        if (c === '"' && !started) {
            inQuotes = true;
            started = true;
            i++;
            continue;
        }
        if (c === delimiter) {
            row.push(field);
            field = "";
            started = false;
            i++;
            continue;
        }
        if (c === "\n" || c === "\r") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            started = false;
            i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
            continue;
        }
        field += c;
        started = true;
        i++;
    }
    if (started || field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

/** Parses decoded CSV text into a table named `name`. Returns null when the text has no non-empty rows. */
export function parseCsvTable(name: string, text: string, preferredDelimiter?: string): ParsedTable | null {
    return buildTable(name, parseCsv(text, sniffDelimiter(text, preferredDelimiter)));
}
