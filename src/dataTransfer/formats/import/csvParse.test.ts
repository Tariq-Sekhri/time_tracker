import {describe, expect, it} from "vitest";
import {parseCsv, parseCsvTable, sniffDelimiter} from "./csvParse.ts";
import {buildTable, unguardCell} from "./table.ts";
import {decodeText, normalizeHeader} from "./text.ts";

describe("sniffDelimiter", () => {
    it("picks the consistent delimiter and ignores delimiters inside quotes", () => {
        expect(sniffDelimiter("a,b,c\n1,2,3\n")).toBe(",");
        expect(sniffDelimiter('a;b;c\n"1,5";"2,5";"x, y, z"\n4;5;6')).toBe(";");
        expect(sniffDelimiter("a\tb\tc\n1\t2,5\t3")).toBe("\t");
        expect(sniffDelimiter("a|b|c\n1|2|3")).toBe("|");
        expect(sniffDelimiter('Title,Notes\n"x","multi\nline; with; semis"\n')).toBe(",");
    });

    it("falls back to the preferred delimiter or comma for a single column", () => {
        expect(sniffDelimiter("only\nvalues")).toBe(",");
        expect(sniffDelimiter("only\nvalues", "\t")).toBe("\t");
    });
});

describe("parseCsv", () => {
    it("handles quotes, escaped quotes, embedded newlines and all line endings", () => {
        const text = 'a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r3,,\r4,5,6';
        expect(parseCsv(text, ",")).toEqual([
            ["a", "b", "c"],
            ["x, y", 'say "hi"', "line1\nline2"],
            ["3", "", ""],
            ["4", "5", "6"],
        ]);
    });

    it("does not add a phantom row for a trailing newline but keeps a trailing empty quoted field", () => {
        expect(parseCsv("a,b\n1,2\n", ",")).toEqual([["a", "b"], ["1", "2"]]);
        expect(parseCsv('a,b\n1,""', ",")).toEqual([["a", "b"], ["1", ""]]);
    });

    it("is lenient with stray quotes inside unquoted fields", () => {
        expect(parseCsv('a,b\n5" screen,ok', ",")).toEqual([["a", "b"], ['5" screen', "ok"]]);
    });
});

describe("buildTable", () => {
    it("skips empty rows, trims headers, names empty headers and pads rows", () => {
        const table = buildTable("t.csv", [["", "", ""], [" Title ", "", "Hours", ""], ["x", "y"], [" ", ""], ["a", "b", "1", ""]]);
        expect(table).toEqual({name: "t.csv", headers: ["Title", "Column 2", "Hours"], rows: [["x", "y", ""], ["a", "b", "1"]]});
    });

    it("returns null for empty input", () => {
        expect(buildTable("t", [[""], []])).toBeNull();
    });

    it("strips the formula guard apostrophe only before = + - @ tab or CR", () => {
        expect(unguardCell("'=SUM(A1)")).toBe("=SUM(A1)");
        expect(unguardCell("'+1")).toBe("+1");
        expect(unguardCell("'-x")).toBe("-x");
        expect(unguardCell("'@user")).toBe("@user");
        expect(unguardCell("'quoted'")).toBe("'quoted'");
        expect(unguardCell("'")).toBe("'");
    });

    it("parses a whole table", () => {
        expect(parseCsvTable("x.csv", "A;B\n1;2\n")).toEqual({name: "x.csv", headers: ["A", "B"], rows: [["1", "2"]]});
    });
});

describe("decodeText", () => {
    it("strips a UTF-8 BOM", () => {
        const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Café")]);
        expect(decodeText(bytes)).toBe("Café");
    });

    it("falls back to windows-1252 for invalid UTF-8", () => {
        expect(decodeText(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x80]))).toBe("Café €");
    });

    it("decodes UTF-16LE with BOM (Excel 'Unicode text')", () => {
        const text = "A\tB\nÉ\t1";
        const bytes = new Uint8Array(2 + text.length * 2);
        bytes[0] = 0xff;
        bytes[1] = 0xfe;
        for (let i = 0; i < text.length; i++) {
            bytes[2 + i * 2] = text.charCodeAt(i) & 0xff;
            bytes[3 + i * 2] = text.charCodeAt(i) >> 8;
        }
        expect(decodeText(bytes)).toBe(text);
    });

    it("normalizes headers", () => {
        expect(normalizeHeader("Duration (h)")).toBe("durationh");
        expect(normalizeHeader(" Start date ")).toBe("startdate");
        expect(normalizeHeader("Billable?")).toBe("billable");
    });
});
