import {describe, expect, it} from "vitest";
import type {ExportOptions} from "../types.ts";
import {deserializePresets, deserializeSettings, mergeOptions, removePreset, sameSettings, serializePresets, serializeSettings, upsertPreset, type ExportPreset, type ExportSettings} from "./presets.ts";
import {ALL_FILTERS, timesheetInclude} from "./scope.ts";

const options: ExportOptions = {
    format: "xlsx",
    framework: "native",
    columns: {},
    durationFormat: "hms",
    timeFormat: "24h",
    dateFormat: "iso",
    csvDelimiter: ",",
    csvBom: true,
    rounding: 0,
    roundingMode: "nearest",
    summaryGrouping: "none",
    userName: "",
    userEmail: "",
    pdf: {
        title: "Time report",
        preparedBy: "",
        preparedFor: "",
        orientation: "portrait",
        pageSize: "a4",
        sections: {overview: true, categoryBreakdown: true, dailyBreakdown: true, deviceBreakdown: false, detail: true, signature: false},
        accentColor: "#3b82f6",
    },
};
const defaults: ExportSettings = {
    scopeTemplate: {range: {preset: "this_month", customStart: "2026-01-01", customEnd: "2026-01-31"}, filters: ALL_FILTERS, include: timesheetInclude()},
    options,
};

describe("presets", () => {
    it("round-trips presets with range presets, filters and options", () => {
        const preset: ExportPreset = {
            name: "Monthly invoice",
            scopeTemplate: {range: {preset: "last_month", customStart: "", customEnd: ""}, filters: {devices: null, activityCategories: ["Work"], manualCategories: [null, 4]}, include: timesheetInclude()},
            options: {...options, format: "pdf", rounding: 15, roundingMode: "up", columns: {manual_entries: ["date", "title"]}, pdf: {...options.pdf, preparedFor: "ACME"}},
        };
        const restored = deserializePresets(serializePresets([preset]), defaults);
        expect(restored).toEqual([preset]);
    });

    it("skips malformed presets, duplicate names and bad JSON", () => {
        expect(deserializePresets("not json", defaults)).toEqual([]);
        expect(deserializePresets(JSON.stringify({name: "x"}), defaults)).toEqual([]);
        const json = JSON.stringify([
            {name: " A ", scopeTemplate: {}, options: {}},
            {name: "a", scopeTemplate: {}, options: {}},
            {name: "", scopeTemplate: {}, options: {}},
            {name: "B"},
        ]);
        const presets = deserializePresets(json, defaults);
        expect(presets.map((item) => item.name)).toEqual(["A"]);
        expect(presets[0].scopeTemplate.range.preset).toBe("this_month");
        expect(presets[0].options).toEqual(options);
    });

    it("merges partial or wrongly typed options over defaults", () => {
        const merged = mergeOptions(options, {format: "csv", rounding: "15", csvBom: false, pdf: {title: "X", sections: {signature: true, overview: "yes"}}, columns: {manual_entries: ["a", 3]}});
        expect(merged.format).toBe("csv");
        expect(merged.rounding).toBe(0);
        expect(merged.csvBom).toBe(false);
        expect(merged.pdf.title).toBe("X");
        expect(merged.pdf.sections).toEqual({...options.pdf.sections, signature: true});
        expect(merged.columns).toEqual({manual_entries: ["a"]});
        expect(options.pdf.title).toBe("Time report");
    });

    it("ignores unknown range presets and include flags", () => {
        const settings = deserializeSettings(JSON.stringify({scopeTemplate: {range: {preset: "next_decade"}, include: {devices: true, bogus: true}}, options: {}}), defaults)!;
        expect(settings.scopeTemplate.range.preset).toBe("this_month");
        expect(settings.scopeTemplate.include).toEqual({...timesheetInclude(), devices: true});
        expect(deserializeSettings(serializeSettings(defaults), defaults)).toEqual(defaults);
        expect(deserializeSettings(null, defaults)).toBeNull();
    });

    it("falls back for invalid enums, nonfinite rounding and malformed PDF settings", () => {
        const corrupted = {format: "html", framework: "missing", durationFormat: "days", timeFormat: "25h", dateFormat: "invalid", csvDelimiter: "|", rounding: Infinity, roundingMode: "sideways", summaryGrouping: "client", pdf: {orientation: "diagonal", pageSize: "a0", accentColor: "red", sections: {overview: null}}};
        expect(mergeOptions(options, corrupted)).toEqual(options);
        expect(mergeOptions(options, {...corrupted, rounding: NaN})).toEqual(options);
        expect(mergeOptions(options, {...corrupted, rounding: 7})).toEqual(options);
        expect(mergeOptions(options, {...corrupted, rounding: 1.5})).toEqual(options);
    });

    it("keeps supported alternatives and filters invalid category IDs from saved presets", () => {
        const settings = deserializeSettings(JSON.stringify({scopeTemplate: {filters: {manualCategories: [null, 4, 0, -1, 1.5, "2", 1e100]}}, options: {format: "json", framework: "harvest", durationFormat: "decimal", timeFormat: "12h", dateFormat: "eu", csvDelimiter: "\t", rounding: 6, roundingMode: "down", summaryGrouping: "device", pdf: {orientation: "landscape", pageSize: "letter", accentColor: "#ABC123"}}}), defaults)!;
        expect(settings.scopeTemplate.filters.manualCategories).toEqual([null, 4]);
        expect(settings.options).toMatchObject({format: "json", framework: "harvest", durationFormat: "decimal", timeFormat: "12h", dateFormat: "eu", csvDelimiter: "\t", rounding: 6, roundingMode: "down", summaryGrouping: "device", pdf: {orientation: "landscape", pageSize: "letter", accentColor: "#ABC123"}});
        expect(options.framework).toBe("native");
    });

    it("upserts by case-insensitive name and removes by name", () => {
        const a: ExportPreset = {name: "b", ...defaults};
        let list = upsertPreset([], a);
        list = upsertPreset(list, {...defaults, name: "A"});
        list = upsertPreset(list, {...defaults, name: "B ", options: {...options, format: "csv"}});
        expect(list.map((item) => item.name)).toEqual(["A", "B"]);
        expect(list[1].options.format).toBe("csv");
        expect(removePreset(list, "A").map((item) => item.name)).toEqual(["B"]);
    });
});

describe("sameSettings", () => {
    it("ignores key order", () => {
        const reordered = JSON.parse(JSON.stringify({options: defaults.options, scopeTemplate: {include: defaults.scopeTemplate.include, filters: defaults.scopeTemplate.filters, range: defaults.scopeTemplate.range}}));
        expect(sameSettings(defaults, reordered)).toBe(true);
        expect(sameSettings(defaults, {...defaults, options: {...defaults.options, csvBom: false}})).toBe(false);
    });
});
