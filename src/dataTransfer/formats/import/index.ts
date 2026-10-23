import type {FrameworkId, ParsedImportFile, ParsedTable} from "../../types.ts";
import {parseBackup} from "./backup.ts";
import {parseCsvTable} from "./csvParse.ts";
import {detectFileKind, detectFramework} from "./detect.ts";
import {decodeText, fileExtension, ImportFileError} from "./text.ts";
import {parseXlsx} from "./xlsxParse.ts";

export {convertRows} from "./convert.ts";
export {guessMapping, importFieldDefs} from "./mapping.ts";

/**
 * Parses a picked file. .csv/.tsv/.txt → one table, .xlsx → one table per non-empty sheet
 * (summary-like sheets last), .json → our backup format. Throws ImportFileError with a
 * user-facing message for unsupported or unreadable files.
 */
export async function parseImportFile(fileName: string, bytes: Uint8Array): Promise<ParsedImportFile> {
    const kind = detectFileKind(fileName, bytes);
    if (kind === "json") {
        return {kind: "backup", fileName, ...parseBackup(decodeText(bytes))};
    }

    let tables: ParsedTable[];
    if (kind === "xlsx") {
        tables = await parseXlsx(bytes);
    } else {
        const ext = fileExtension(fileName);
        const table = parseCsvTable(fileName, decodeText(bytes), ext === "tsv" || ext === "tab" ? "\t" : undefined);
        tables = table ? [table] : [];
    }
    if (!tables.length) throw new ImportFileError(`"${fileName}" doesn't contain any data.`);

    let detectedFramework: FrameworkId | null = null;
    for (const table of tables) {
        detectedFramework = detectFramework(table.headers);
        if (detectedFramework) break;
    }
    return {kind: "table", fileName, tables, detectedFramework};
}
