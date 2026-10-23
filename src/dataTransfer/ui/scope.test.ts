import {describe, expect, it} from "vitest";
import type {ExportFilterOptions} from "../../api/dataTransfer.ts";
import {buildCountScope, buildScope, emptyInclude, exportSummary, normalizeSelection, selectionSummary, timesheetInclude, ALL_FILTERS} from "./scope.ts";

const options: ExportFilterOptions = {
    devices: [
        {uuid: "a", name: "Desk", kind: "local", in_cal: true, in_stats: true},
        {uuid: "b", name: "Laptop", kind: "remote", in_cal: true, in_stats: true},
        {uuid: "c", name: "Old", kind: "remote", in_cal: false, in_stats: false},
    ],
    activity_categories: [{name: "Work", color: "#f00"}, {name: "Games", color: null}],
    manual_categories: [
        {id: null, name: "Uncategorized", color: "#888", parent_id: null, parent_name: null},
        {id: 1, name: "Client", color: "#00f", parent_id: null, parent_name: null},
        {id: 2, name: "Project", color: "#0f0", parent_id: 1, parent_name: "Client"},
    ],
    data_start: null,
    data_end: null,
};
const range = {start: 100, end: 200};

describe("normalizeSelection", () => {
    it("keeps null as all and collapses a full selection to null", () => {
        expect(normalizeSelection(null, ["a", "b"])).toBeNull();
        expect(normalizeSelection(["b", "a"], ["a", "b"])).toBeNull();
    });

    it("returns narrowed selections in option order and drops stale values", () => {
        expect(normalizeSelection(["c", "a", "gone"], ["a", "b", "c", "d"])).toEqual(["a", "c"]);
        expect(normalizeSelection([], ["a"])).toEqual([]);
        expect(normalizeSelection([null, 2], [null, 1, 2])).toEqual([null, 2]);
    });
});

describe("buildScope", () => {
    it("sends null filters when nothing was narrowed", () => {
        const scope = buildScope(range, {...emptyInclude(), manual_entries: true, activity_sessions: true}, ALL_FILTERS, options);
        expect(scope).toMatchObject({range_start: 100, range_end: 200, device_uuids: null, activity_categories: null, manual_category_ids: null});
    });

    it("sends arrays only for narrowed filters that apply to included datasets", () => {
        const filters = {devices: ["b"], activityCategories: ["Work", "Games"], manualCategories: [null, 2]};
        const timesheet = buildScope(range, timesheetInclude(), filters, options);
        expect(timesheet.device_uuids).toBeNull();
        expect(timesheet.manual_category_ids).toEqual([null, 2]);
        const sessions = buildScope(range, {...emptyInclude(), activity_sessions: true}, filters, options);
        expect(sessions.device_uuids).toEqual(["b"]);
        expect(sessions.activity_categories).toBeNull();
        expect(sessions.manual_category_ids).toBeNull();
    });

    it("does not alias the include object", () => {
        const include = timesheetInclude();
        const scope = buildScope(range, include, ALL_FILTERS, options);
        scope.include.devices = true;
        expect(include.devices).toBe(false);
    });

    it("requests every dataset for counts but skips logs unless selected", () => {
        const counts = buildCountScope(range, timesheetInclude(), {...ALL_FILTERS, devices: ["a"]}, options);
        expect(counts.include).toMatchObject({manual_entries: true, activity_sessions: true, activity_logs: false, skipped_apps: true});
        expect(counts.device_uuids).toEqual(["a"]);
        expect(buildCountScope(range, {...emptyInclude(), activity_logs: true}, ALL_FILTERS, options).include.activity_logs).toBe(true);
    });
});

describe("summaries", () => {
    it("writes the export sentence", () => {
        const include = {...emptyInclude(), manual_entries: true, activity_sessions: true};
        expect(exportSummary(include, {manual_entries: 142, activity_sessions: 380}, "Mar 1 – Mar 31, 2026", "xlsx"))
            .toBe("142 manual entries and 380 sessions from Mar 1 – Mar 31, 2026 as Excel");
        expect(exportSummary({...emptyInclude(), devices: true}, {devices: 1}, "Mar 1", "json")).toBe("1 device as JSON");
        expect(exportSummary(emptyInclude(), {}, null, "csv")).toBe("Choose what to export.");
    });

    it("summarises selections", () => {
        expect(selectionSummary(null, 3, "devices")).toBe("All devices");
        expect(selectionSummary(["a", "b"], 3, "devices")).toBe("2 of 3 devices");
        expect(selectionSummary([], 3, "devices")).toBe("No devices");
    });
});
