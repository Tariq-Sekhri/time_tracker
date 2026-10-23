/** Thrown for problems the user can fix (wrong file type, unreadable file). The message is shown as-is. */
export class ImportFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ImportFileError";
    }
}

/**
 * Decodes text bytes: UTF-16 (by BOM), UTF-8 (BOM stripped), falling back to windows-1252
 * when the bytes are not valid UTF-8 (typical for CSVs saved by older Excel versions).
 */
export function decodeText(bytes: Uint8Array): string {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return stripBom(new TextDecoder("utf-16le").decode(bytes.subarray(2)));
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return stripBom(new TextDecoder("utf-16be").decode(bytes.subarray(2)));
    try {
        return stripBom(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
    } catch {
        return stripBom(fixC1(new TextDecoder("windows-1252").decode(bytes)));
    }
}

/** windows-1252 characters for bytes 0x80–0x9F (undefined bytes keep their code point). */
const CP1252_C1 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";

/** Some runtimes (Node) decode "windows-1252" as latin1, leaving C1 control characters; map them like browsers do. */
function fixC1(text: string): string {
    return text.replace(/[\u0080-\u009f]/g, (c) => CP1252_C1[c.charCodeAt(0) - 0x80]);
}

export function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** "Duration (h)" → "durationh", "Start date" → "startdate". */
export function normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function fileExtension(fileName: string): string {
    const base = fileName.split(/[\\/]/).pop() ?? fileName;
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}
