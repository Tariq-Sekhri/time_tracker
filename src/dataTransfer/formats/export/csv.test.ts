import {describe, expect, it} from "vitest";
import {text} from "./cells.ts";
import {csvCellText, csvField, encodeCsv, toCsv} from "./csv.ts";
import {options, sampleDataset} from "./fixtures.ts";
import {buildExport} from "./index.ts";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("csv encoding", () => {
    it("quotes fields per RFC 4180", () => {
        expect(csvField("plain", ",")).toBe("plain");
        expect(csvField("a,b", ",")).toBe('"a,b"');
        expect(csvField('say "hi"', ",")).toBe('"say ""hi"""');
        expect(csvField("line\nbreak", ",")).toBe('"line\nbreak"');
        expect(csvField("cr\rhere", ",")).toBe('"cr\rhere"');
        expect(csvField("a;b", ",")).toBe("a;b");
        expect(csvField("a;b", ";")).toBe('"a;b"');
        expect(csvField("a\tb", "\t")).toBe('"a\tb"');
    });

    it("uses CRLF line endings and the chosen delimiter", () => {
        const csv = toCsv(["A", "B"], [[text("1"), text("x;y")]], options({csvDelimiter: ";"}));
        expect(csv).toBe('A;B\r\n1;"x;y"\r\n');
    });

    it("adds a BOM only when asked", () => {
        expect([...encodeCsv("a", true).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        expect([...encodeCsv("a", false)]).toEqual([0x61]);
    });

    it("guards text against formula injection but not formatted values", () => {
        const o = options();
        for (const value of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) expect(csvCellText(text(value), o)).toBe(`'${value}`);
        expect(csvCellText(text("normal"), o)).toBe("normal");
        expect(csvCellText({kind: "number", value: -5}, o)).toBe("-5");
        expect(csvCellText({kind: "duration", seconds: 90}, o)).toBe("0:01:30");
    });
});

describe("csv export", () => {
    it("writes one file per dataset with rows plus a summary", async () => {
        const files = await buildExport(sampleDataset(), options({format: "csv"}));
        expect(files.map((f) => f.fileName)).toEqual([
            "time-tracker-manual-entries-2026-03-01_to_2026-03-31.csv",
            "time-tracker-activity-sessions-2026-03-01_to_2026-03-31.csv",
            "time-tracker-devices-2026-03-01_to_2026-03-31.csv",
            "time-tracker-activity-categories-2026-03-01_to_2026-03-31.csv",
            "time-tracker-manual-categories-2026-03-01_to_2026-03-31.csv",
            "time-tracker-app-groups-2026-03-01_to_2026-03-31.csv",
            "time-tracker-skipped-apps-2026-03-01_to_2026-03-31.csv",
            "time-tracker-summary-by-category-2026-03-01_to_2026-03-31.csv",
        ]);
        expect(files.every((f) => f.mimeType === "text/csv")).toBe(true);
    });

    it("formats native manual entries with default columns, sorted by start", async () => {
        const [manual] = await buildExport(sampleDataset(), options({format: "csv", summaryGrouping: "none", csvBom: false}));
        const lines = decode(manual.bytes).split("\r\n");
        expect(lines[0]).toBe("Date,Start,End,Duration,Title,Category,Parent category,Category path,Notes");
        expect(lines[1]).toBe("2026-03-03,09:00:00,09:50:00,0:50:00,'=SUM(A1),Admin,,Admin,");
        expect(lines[2]).toBe('2026-03-04,14:05:00,15:35:00,1:30:00,Design review,Website,Acme,Acme › Website,"With ""Bob"", Alice"');
        expect(lines[3]).toBe("2026-03-09,08:00:00,08:07:00,0:07:00,Misc,Uncategorized,,Uncategorized,");
    });

    it("honors custom columns, date/time/duration formats and rounding", async () => {
        const files = await buildExport(
            sampleDataset(),
            options({
                format: "csv",
                csvBom: false,
                summaryGrouping: "none",
                columns: {manual_entries: ["title", "bogus", "date", "start", "duration"]},
                dateFormat: "eu",
                timeFormat: "12h",
                durationFormat: "decimal",
                rounding: 15,
                roundingMode: "up",
            }),
        );
        expect(decode(files[0].bytes).split("\r\n").slice(0, 4)).toEqual([
            "Title,Date,Start,Duration",
            "'=SUM(A1),03/03/2026,9:00:00 AM,1.00",
            "Design review,04/03/2026,2:05:00 PM,1.50",
            "Misc,09/03/2026,8:00:00 AM,0.25",
        ]);
    });

    it("writes a header-only manual entries file when nothing has rows", async () => {
        const data = {...sampleDataset(), manual_entries: [], activity_sessions: [], devices: [], activity_categories: [], manual_categories: [], app_groups: [], skipped_apps: []};
        const files = await buildExport(data, options({format: "csv", csvBom: false, summaryGrouping: "none"}));
        expect(files).toHaveLength(1);
        expect(decode(files[0].bytes)).toBe("Date,Start,End,Duration,Title,Category,Parent category,Category path,Notes\r\n");
    });

    it("writes grouped summary totals", async () => {
        const files = await buildExport(sampleDataset(), options({format: "csv", csvBom: false, summaryGrouping: "day"}));
        const summary = decode(files[files.length - 1].bytes).split("\r\n");
        expect(summary[0]).toBe("Day,Manual,Activity,Total,Share");
        expect(summary[1]).toMatch(/^2026-03-03,0:50:00,0:00:00,0:50:00,/);
        expect(summary[2]).toMatch(/^2026-03-04,1:30:00,0:50:00,2:20:00,/);
        expect(summary[4]).toBe("TOTAL,2:27:00,0:50:00,3:17:00,100.0%");
    });
});
