import {describe, expect, it} from "vitest";
import {emptyImportRequest, type ImportManualEntry, type ImportReport} from "../../api/dataTransfer.ts";
import type {ConvertedRow} from "../types.ts";
import {backupRequest, countByStatus, reviewRows, sampleValues, tableRequest, validateMapping} from "./importLogic.ts";
import {parseCsv} from "./preview.ts";

const entry = (title: string): ImportManualEntry => ({title, notes: null, category_path: [], start_time: 0, end_time: 60});
const report = (patch: Partial<ImportReport>): ImportReport => ({
    dry_run: true, manual_entries_imported: 0, manual_entries_duplicate: 0, duplicate_indices: [], manual_entries_invalid: [],
    manual_categories_created: [], activity_categories_created: [], category_rules_added: 0, app_groups_added: 0,
    skipped_apps_added: 0, devices_added: 0, activity_logs_imported: 0, activity_logs_duplicate: 0, ...patch,
});

describe("validateMapping", () => {
    it("accepts start/end datetimes and date + times", () => {
        expect(validateMapping({start_datetime: 0, end_datetime: 1})).toEqual({ok: true, errors: [], usesDayStart: false});
        expect(validateMapping({start_date: 0, start_time: 1, end_time: 2}).ok).toBe(true);
        expect(validateMapping({start_date: 0, start_time: 1, duration: 2}).ok).toBe(true);
    });

    it("accepts a date + duration and flags the day start hour", () => {
        expect(validateMapping({date: 0, duration: 1})).toEqual({ok: true, errors: [], usesDayStart: true});
    });

    it("explains what is missing", () => {
        expect(validateMapping({}).errors).toHaveLength(2);
        expect(validateMapping({title: 0, duration: 1}).errors[0]).toMatch(/Start date/);
        expect(validateMapping({date: 0}).errors[0]).toMatch(/Duration/);
        expect(validateMapping({date: 0, end_time: 1}).errors[0]).toMatch(/Without a start time/);
    });
});

describe("rows", () => {
    it("samples distinct non-empty values", () => {
        const table = {name: "t", headers: ["a"], rows: [[""], ["x"], ["x"], ["y"], ["z"], ["w"]]};
        expect(sampleValues(table, 0)).toEqual(["x", "y", "z"]);
        expect(sampleValues(table, 4)).toEqual([]);
    });

    it("builds a table request and merges conversion errors with the dry run", () => {
        const converted: ConvertedRow[] = [
            {row: 0, entry: entry("a"), error: null},
            {row: 1, entry: null, error: "Bad date"},
            {row: 2, entry: entry("b"), error: null},
            {row: 3, entry: entry("c"), error: null},
        ];
        const {request, entryRows} = tableRequest(converted, "skip", false);
        expect(request.manual_entries.map((item) => item.title)).toEqual(["a", "b", "c"]);
        expect(request.create_missing_categories).toBe(false);
        expect(entryRows).toEqual([0, 2, 3]);
        const rows = reviewRows(request.manual_entries, entryRows, converted, report({duplicate_indices: [1], manual_entries_invalid: [{index: 2, message: "Ends before it starts"}]}));
        expect(rows.map((row) => [row.sourceRow, row.status, row.message])).toEqual([
            [1, "new", null], [2, "error", "Bad date"], [3, "duplicate", null], [4, "error", "Ends before it starts"],
        ]);
        expect(countByStatus(rows)).toEqual({new: 1, duplicate: 1, error: 2});
    });

    it("keeps only chosen backup sections, with devices following logs", () => {
        const source = {...emptyImportRequest(), manual_entries: [entry("a")], skipped_apps: ["x"], devices: [{uuid: "d", name: "D"}], activity_logs: [{device_uuid: "d", id: 1, app: "a", timestamp: 0, duration: 1}]};
        const sections = {manual_entries: true, manual_categories: true, activity_categories: true, app_groups: true, skipped_apps: false, devices: false, activity_logs: false};
        const request = backupRequest(source, sections, "import", true);
        expect(request).toMatchObject({duplicate_strategy: "import", manual_entries: [entry("a")], skipped_apps: [], devices: [], activity_logs: []});
        expect(backupRequest(source, {...sections, activity_logs: true}, "skip", true).devices).toHaveLength(1);
        expect(backupRequest(source, {...sections, devices: true}, "skip", true)).toMatchObject({devices: source.devices, activity_logs: []});
    });
});

describe("parseCsv", () => {
    it("handles quotes, escaped quotes, CRLF and a BOM", () => {
        expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n1,\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["1", ""]]);
        expect(parseCsv("a;b\n1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
    });
});
