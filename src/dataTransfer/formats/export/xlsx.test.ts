import ExcelJS from "exceljs";
import {describe, expect, it} from "vitest";
import type {ExportOptions} from "../../types.ts";
import {options, sampleDataset} from "./fixtures.ts";
import {buildExport} from "./index.ts";

async function workbook(overrides: Partial<ExportOptions> = {}) {
    const files = await buildExport(sampleDataset(), options({format: "xlsx", ...overrides}));
    expect(files).toHaveLength(1);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(files[0].bytes.buffer as ArrayBuffer);
    return {file: files[0], wb};
}

const headerValues = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);

describe("xlsx export", () => {
    it("builds a workbook with summary first and one sheet per dataset", async () => {
        const {file, wb} = await workbook();
        expect(file.fileName).toBe("time-tracker-export-2026-03-01_to_2026-03-31.xlsx");
        expect(file.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(wb.creator).toBe("Time Tracker");
        expect(wb.worksheets.map((ws) => ws.name)).toEqual([
            "Summary",
            "Manual entries",
            "Activity sessions",
            "Devices",
            "Activity categories",
            "Manual categories",
            "App groups",
            "Skipped apps",
        ]);
    });

    it("writes real local dates, times and duration fractions with number formats", async () => {
        const {wb} = await workbook({columns: {manual_entries: ["date", "start", "duration", "title", "category_color"]}});
        const ws = wb.getWorksheet("Manual entries")!;
        expect(headerValues(ws)).toEqual(["Date", "Start", "Duration", "Title", "Category color"]);
        const row = ws.getRow(2);
        expect(row.getCell(1).value).toEqual(new Date(Date.UTC(2026, 2, 3)));
        expect(row.getCell(1).numFmt).toBe("yyyy-mm-dd");
        expect(row.getCell(2).value).toEqual(new Date(Date.UTC(2026, 2, 3, 9, 0)));
        expect(row.getCell(2).numFmt).toBe("hh:mm:ss");
        // Stored as the day fraction 3000/86400; exceljs reads time-formatted numbers back as Dates from the 1899-12-30 epoch.
        expect(row.getCell(3).value).toEqual(new Date(Date.UTC(1899, 11, 30, 0, 50)));
        expect(row.getCell(3).numFmt).toBe("[h]:mm:ss");
        expect(row.getCell(4).value).toBe("=SUM(A1)");
        expect((row.getCell(5).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFEF4444");
        expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
        expect(ws.views[0]).toMatchObject({state: "frozen", ySplit: 1, xSplit: 1});
        expect(ws.autoFilter).toBeTruthy();

        const total = ws.getRow(5);
        expect(total.getCell(1).value).toBe("Total");
        expect(total.getCell(3).value).toMatchObject({formula: "SUBTOTAL(109,C2:C4)"});
        expect((total.getCell(3).value as {result: unknown}).result).toEqual(new Date(Date.UTC(1899, 11, 30, 2, 27)));
    });

    it("uses decimal hours and user date/time formats", async () => {
        const {wb} = await workbook({durationFormat: "decimal", dateFormat: "us", timeFormat: "12h", columns: {manual_entries: ["date", "start", "duration"]}});
        const row = wb.getWorksheet("Manual entries")!.getRow(3);
        expect(row.getCell(1).numFmt).toBe("mm/dd/yyyy");
        expect(row.getCell(2).numFmt).toBe("h:mm:ss AM/PM");
        expect(row.getCell(3).value).toBe(1.5);
        expect(row.getCell(3).numFmt).toBe("0.00");
    });

    it("lays out framework sheets with exact headers", async () => {
        const {wb} = await workbook({framework: "toggl", userEmail: "ada@example.com"});
        const ws = wb.getWorksheet("Manual entries (Toggl Track)")!;
        expect(headerValues(ws)).toEqual(["Email", "Duration", "Project", "Description", "Start date", "Start time", "Client", "Task", "Tags", "Billable"]);
        expect(ws.getRow(2).getCell(2).numFmt).toBe("[hh]:mm:ss");
    });

    it("summarises totals by the chosen grouping plus categories", async () => {
        const {wb} = await workbook({summaryGrouping: "day"});
        const ws = wb.getWorksheet("Summary")!;
        const texts: string[] = [];
        ws.eachRow((row) => row.eachCell((cell) => typeof cell.value === "string" && texts.push(cell.value)));
        expect(texts[0]).toBe("Time report");
        expect(texts).toContain("By day");
        expect(texts).toContain("By category");
        expect(texts.filter((t) => t === "TOTAL")).toHaveLength(2);
        expect(texts).toContain("Acme");
        expect(texts).toContain("2026-03-04");
    });
});
