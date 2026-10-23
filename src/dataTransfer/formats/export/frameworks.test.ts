import {describe, expect, it} from "vitest";
import type {ExportOptions, FrameworkId} from "../../types.ts";
import {splitName} from "./frameworks.ts";
import {options, sampleDataset} from "./fixtures.ts";
import {buildExport, columnsFor, requiredColumns} from "./index.ts";

const manualCsv = async (overrides: Partial<ExportOptions>) => {
    const files = await buildExport(
        sampleDataset(),
        options({format: "csv", csvBom: false, summaryGrouping: "none", userEmail: "ada@example.com", userName: "Ada Lovelace King", ...overrides}),
    );
    return {fileName: files[0].fileName, lines: new TextDecoder().decode(files[0].bytes).split("\r\n").filter(Boolean)};
};

describe("columnsFor", () => {
    it("lists native defaults", () => {
        const defaults = (dataset: Parameters<typeof columnsFor>[0]) =>
            columnsFor(dataset, "native")
                .filter((c) => c.defaultOn)
                .map((c) => c.key);
        expect(defaults("manual_entries")).toEqual(["date", "start", "end", "duration", "title", "category", "parent_category", "category_path", "notes"]);
        expect(columnsFor("manual_entries", "native").filter((c) => !c.defaultOn).map((c) => c.key)).toEqual(["category_color", "id", "created_at", "updated_at"]);
        expect(defaults("activity_sessions")).toEqual(["date", "start", "end", "duration", "active_duration", "category", "device", "top_app", "apps"]);
        expect(defaults("activity_logs")).toEqual(["date", "time", "duration", "app", "app_group", "category", "device"]);
        expect(defaults("devices")).toEqual(["name", "kind", "uuid", "in_cal", "in_stats"]);
        expect(defaults("activity_categories")).toEqual(["name", "color", "priority", "is_visible", "in_stats", "rules", "rule_count"]);
        expect(defaults("manual_categories")).toEqual(["name", "parent_name", "path", "color", "id"]);
        expect(defaults("app_groups")).toEqual(["name", "regex"]);
        expect(defaults("skipped_apps")).toEqual(["regex"]);
    });

    it("only changes manual entries for frameworks", () => {
        for (const framework of ["clockify", "toggl", "harvest"] as FrameworkId[]) {
            expect(columnsFor("activity_logs", framework)).toEqual(columnsFor("activity_logs", "native"));
            expect(columnsFor("manual_entries", framework)).not.toEqual(columnsFor("manual_entries", "native"));
        }
    });

    it("marks required framework columns as default", () => {
        for (const framework of ["clockify", "toggl", "harvest"] as FrameworkId[]) {
            const defaults = columnsFor("manual_entries", framework)
                .filter((c) => c.defaultOn)
                .map((c) => c.key);
            expect(requiredColumns("manual_entries", framework).every((key) => defaults.includes(key))).toBe(true);
        }
        expect(requiredColumns("manual_entries", "toggl")).toEqual(["email", "duration", "start_date", "start_time"]);
        expect(requiredColumns("manual_entries", "native")).toEqual([]);
    });
});

describe("framework layouts", () => {
    it("clockify", async () => {
        const {fileName, lines} = await manualCsv({framework: "clockify"});
        expect(fileName).toBe("time-tracker-manual-entries-clockify-2026-03-01_to_2026-03-31.csv");
        expect(lines).toEqual([
            "Project,Client,Description,Task,Email,Tag,Billable,Start date,Start time,Duration",
            "Admin,,'=SUM(A1),,ada@example.com,,No,03/03/2026,09:00,00:50:00",
            "Website,Acme,Design review,,ada@example.com,,No,03/04/2026,14:05,01:30:00",
            ",,Misc,,ada@example.com,,No,03/09/2026,08:00,00:07:00",
        ]);
    });

    it("clockify follows time and duration options, dates stay MM/DD/YYYY", async () => {
        const {lines} = await manualCsv({
            framework: "clockify",
            timeFormat: "12h",
            durationFormat: "hm",
            dateFormat: "eu",
            columns: {manual_entries: ["start_date", "start_time", "end_date", "end_time", "duration", "duration_decimal", "user"]},
        });
        expect(lines[0]).toBe("Start date,Start time,End date,End time,Duration,Duration (decimal),User");
        expect(lines[2]).toBe("03/04/2026,02:05 PM,03/04/2026,03:35 PM,01:30,1.50,Ada Lovelace King");
    });

    it("toggl uses fixed formats regardless of options", async () => {
        const {fileName, lines} = await manualCsv({framework: "toggl", timeFormat: "12h", dateFormat: "us", durationFormat: "decimal"});
        expect(fileName).toBe("time-tracker-manual-entries-toggl-2026-03-01_to_2026-03-31.csv");
        expect(lines).toEqual([
            "Email,Duration,Project,Description,Start date,Start time,Client,Task,Tags,Billable",
            "ada@example.com,00:50:00,Admin,'=SUM(A1),2026-03-03,09:00:00,,,,No",
            "ada@example.com,01:30:00,Website,Design review,2026-03-04,14:05:00,Acme,,,No",
            "ada@example.com,00:07:00,,Misc,2026-03-09,08:00:00,,,,No",
        ]);
    });

    it("harvest", async () => {
        const {lines} = await manualCsv({framework: "harvest", dateFormat: "us", durationFormat: "hms"});
        expect(lines).toEqual([
            "Date,Client,Project,Task,Notes,Hours,First name,Last name",
            "2026-03-03,Internal,Admin,General,'=SUM(A1),0.83,Ada,Lovelace King",
            '2026-03-04,Acme,Website,General,"Design review — With ""Bob"", Alice",1.50,Ada,Lovelace King',
            "2026-03-09,Internal,Uncategorized,General,Misc,0.12,Ada,Lovelace King",
        ]);
    });

    it("rounds framework durations", async () => {
        const {lines} = await manualCsv({framework: "harvest", rounding: 6, roundingMode: "nearest"});
        expect(lines.slice(1).map((line) => line.split(",").slice(-3)[0])).toEqual(["0.80", "1.50", "0.10"]);
    });

    it("splits names on the first space", () => {
        expect(splitName("  Ada  ")).toEqual(["Ada", ""]);
        expect(splitName("Ada Lovelace King")).toEqual(["Ada", "Lovelace King"]);
    });
});
