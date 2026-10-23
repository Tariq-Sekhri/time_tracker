import {describe, expect, it} from "vitest";
import {buildExport, defaultExportOptions} from "../export/index.ts";
import {entry, local, sampleDataset} from "../export/fixtures.ts";
import {convertRows, guessMapping, parseImportFile} from "./index.ts";
import {parseDateTime, parseTime} from "./dateParse.ts";
import {CLOCKIFY_DETAILED, HARVEST_DETAILED, NATIVE_EU_SEMICOLON, TOGGL_DETAILED} from "./__fixtures__/samples.ts";
import {cellToString} from "./xlsxParse.ts";
import type {FrameworkId, ParsedImportFile} from "../../types.ts";

function converted(parsed: ParsedImportFile, clientHandling: "ignore" | "as_parent_category" = "as_parent_category") {
    if (parsed.kind !== "table") throw new Error("Expected table");
    const table = parsed.tables[0];
    return convertRows(table, {mapping: guessMapping(table.headers, parsed.detectedFramework), clientHandling, dateFormat: "auto", dayStartHour: 9, fallbackCategory: []});
}

describe("import integration", () => {
    it.each(["csv", "xlsx"] as const)("round trips native %s including overnight time, category hierarchy and notes", async (format) => {
        const data = sampleDataset();
        data.manual_entries = [entry({title: "Budget review", notes: "Café, planning\nSecond line", start_time: local(2026, 3, 4, 23, 15), end_time: local(2026, 3, 5, 1, 45)})];
        const file = (await buildExport(data, {...defaultExportOptions(), format})).find((f) => format === "xlsx" || f.fileName.includes("manual-entries"))!;
        const parsed = await parseImportFile(file.fileName, file.bytes);
        const rows = converted(parsed);
        const valid = rows.filter((r) => r.entry);
        expect(valid).toHaveLength(1);
        expect(valid[0].entry).toEqual({title: "Budget review", notes: "Café, planning\nSecond line", category_path: ["Acme", "Website"], start_time: data.manual_entries[0].start_time, end_time: data.manual_entries[0].end_time});
    });

    it.each(["clockify", "toggl", "harvest"] as FrameworkId[])("reads the %s compatibility export", async (framework) => {
        const data = sampleDataset();
        data.manual_entries = [entry({title: "Review", start_time: local(2026, 3, 4, 9), end_time: local(2026, 3, 4, 10, 30)})];
        const file = (await buildExport(data, {...defaultExportOptions(), format: "csv", framework, userName: "Jane Doe", userEmail: "jane@example.com"})).find((f) => f.fileName.includes("manual-entries"))!;
        const rows = converted(await parseImportFile(file.fileName, file.bytes));
        expect(rows).toHaveLength(1);
        expect(rows[0].error).toBeNull();
        expect(rows[0].entry?.end_time! - rows[0].entry?.start_time!).toBe(5400);
        expect(rows[0].entry?.category_path).toEqual(["Acme", "Website"]);
    });

    it.each([["clockify", CLOCKIFY_DETAILED], ["toggl", TOGGL_DETAILED], ["harvest", HARVEST_DETAILED]])("reads detailed %s report samples", async (_name, csv) => {
        const rows = converted(await parseImportFile("report.csv", new TextEncoder().encode(csv)));
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => r.entry && !r.error)).toBe(true);
        if (_name === "harvest") expect(rows[1].entry!.start_time).toBe(rows[0].entry!.end_time);
    });

    it("reports an invalid row without losing valid rows and restores formula-guarded text", async () => {
        const rows = converted(await parseImportFile("report.csv", new TextEncoder().encode(NATIVE_EU_SEMICOLON)));
        expect(rows).toHaveLength(3);
        expect(rows[0].entry?.title).toBe("=Budget review");
        expect(rows[1].entry?.category_path).toEqual([]);
        expect(rows[2].entry).toBeNull();
        expect(rows[2].error).toContain("start time");
    });

    it("restores native JSON entries, category metadata, rules, and device logs", async () => {
        const data = sampleDataset();
        data.activity_logs = [{device_uuid: "dev-1", device_name: "Laptop", id: 42, app: "Code", app_group: null, category: "Coding", timestamp: local(2026, 3, 4, 9), duration: 60}];
        const file = (await buildExport(data, {...defaultExportOptions(), format: "json"}))[0];
        const parsed = await parseImportFile(file.fileName, file.bytes);
        if (parsed.kind !== "backup") throw new Error("Expected backup");
        expect(parsed.request.manual_entries).toHaveLength(3);
        expect(parsed.request.manual_entries[0].category_path).toEqual(["Acme", "Website"]);
        expect(parsed.request.manual_entries[1].title).toBe("=SUM(A1)");
        expect(parsed.request.manual_categories).toHaveLength(3);
        expect(parsed.request.activity_categories).toEqual(data.activity_categories);
        expect(parsed.request.activity_logs[0].id).toBe(42);
        expect(parsed.request.devices).toEqual([{uuid: "dev-1", name: "Laptop"}]);
        expect(parsed.request.dry_run).toBe(true);
    });

    it("rejects damaged backup rows instead of silently dropping them", async () => {
        const json = {format: "time-tracker-export", version: 1, manual_entries: [{title: "Lost", start_time: "invalid", end_time: 99}]};
        await expect(parseImportFile("backup.json", new TextEncoder().encode(JSON.stringify(json)))).rejects.toThrow("manual_entries row 1");
    });

    it("rejects malformed times and timezone offsets", () => {
        expect(parseTime("0:30 AM")).toBeNull();
        expect(parseDateTime("2026-03-04T10:00:00+99:99", "us")).toBeNull();
        expect(parseDateTime("2026-03-04T10:00:00+02:99", "us")).toBeNull();
    });

    it("distinguishes Excel elapsed durations from clock times", () => {
        expect(cellToString(2.5, "[h]:mm:ss", false).text).toBe("60:00:00");
        expect(cellToString(46200.5, "hh:mm:ss", false).text).toBe("12:00:00");
        expect(cellToString({formula: "A1+1", result: 0.5}, "hh:mm", false).text).toBe("12:00:00");
    });

    it("preserves a literal leading apostrophe in an Excel text cell", async () => {
        const data = sampleDataset();
        data.manual_entries = [entry({title: "'=Budget", start_time: local(2026, 3, 4, 9), end_time: local(2026, 3, 4, 10)})];
        const file = (await buildExport(data, {...defaultExportOptions(), format: "xlsx"}))[0];
        const rows = converted(await parseImportFile(file.fileName, file.bytes));
        expect(rows[0].entry?.title).toBe("'=Budget");
    });
});
