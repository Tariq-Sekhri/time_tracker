import type {ParsedTable} from "../../types.ts";

const FORMULA_GUARD = /^'[=+\-@\t\r]/;

/** Our CSV exporter prefixes text starting with = + - @ (or tab / CR) with an apostrophe so spreadsheets don't run it as a formula. */
export function unguardCell(value: string): string {
    return FORMULA_GUARD.test(value) ? value.slice(1) : value;
}

const isBlank = (value: string | undefined) => !value || value.trim() === "";

/**
 * Turns raw rows into a table: drops fully empty rows, uses the first remaining row as the header,
 * names empty headers "Column N" (1-based column index), drops trailing all-empty columns and
 * pads every data row to the header width. Returns null when there are no non-empty rows.
 */
export function buildTable(name: string, rawRows: string[][], removeCsvFormulaGuard = true): ParsedTable | null {
    const rows = rawRows.map((row) => removeCsvFormulaGuard ? row.map(unguardCell) : row).filter((row) => row.some((cell) => !isBlank(cell)));
    if (!rows.length) return null;
    let width = 0;
    for (const row of rows) {
        for (let i = row.length - 1; i >= width; i--) {
            if (!isBlank(row[i])) {
                width = i + 1;
                break;
            }
        }
    }
    const [headerRow, ...data] = rows;
    const headers = Array.from({length: width}, (_, i) => (headerRow[i] ?? "").trim() || `Column ${i + 1}`);
    return {
        name,
        headers,
        rows: data.map((row) => Array.from({length: width}, (_, i) => row[i] ?? "")),
    };
}
