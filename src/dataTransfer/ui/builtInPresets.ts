import {DEFAULT_INVOICE} from "../formats/export/invoice.ts";
import type {ExportInclude} from "../../api/dataTransfer.ts";
import {defaultExportOptions} from "../formats/index.ts";
import type {ExportOptions} from "../types.ts";
import type {RangePreset} from "./dateRanges.ts";
import type {ExportPreset} from "./presets.ts";
import {ALL_FILTERS, emptyInclude, everythingInclude, timesheetInclude} from "./scope.ts";

export type BuiltInExportPreset = ExportPreset & {group: "confirmed" | "suggested"};

function preset(name: string, range: RangePreset, include: ExportInclude, patch: Partial<ExportOptions> = {}): BuiltInExportPreset {
    return {
        name,
        group: "suggested",
        scopeTemplate: {range: {preset: range, customStart: "", customEnd: ""}, filters: {...ALL_FILTERS}, include},
        options: {...defaultExportOptions(), ...patch},
    };
}

/** Starting points for common jobs. Kept separate from the user's saved presets. */
export function builtInExportPresets(): BuiltInExportPreset[] {
    const manual = timesheetInclude();
    const activity = {...emptyInclude(), activity_sessions: true};
    const combined = {...manual, ...activity, manual_entries: true};
    const pdf = (title: string, signature = false): ExportOptions["pdf"] => {
        const defaults = defaultExportOptions().pdf;
        return {...defaults, title, sections: {...defaults.sections, signature}};
    };
    return [
        {...preset("Archiver", "all_time", everythingInclude(), {format: "json"}), group: "confirmed"},
        {...preset("Manual exporter", "this_month", {...manual}, {
            format: "pdf", pdf: {...pdf("Invoice"), layout: "invoice", invoice: {...DEFAULT_INVOICE}},
        }), scopeTemplate: {range: {preset: "this_month", customStart: "", customEnd: ""}, filters: {...ALL_FILTERS, manualCategories: []}, include: {...manual}}, group: "confirmed"},
        preset("Submit a timesheet", "last_week", {...manual}, {summaryGrouping: "day"}),
        preset("Support an invoice", "last_month", {...manual}, {format: "pdf", summaryGrouping: "category", durationFormat: "decimal", pdf: pdf("Invoice supporting records")}),
        preset("Review personal productivity", "this_week", {...activity}, {format: "pdf", summaryGrouping: "day", pdf: pdf("Personal productivity")}),
        preset("Share a time-use report", "last_month", {...combined}, {format: "pdf", summaryGrouping: "category", pdf: pdf("Time-use report")}),
        preset("Analyze time in a spreadsheet", "last_30_days", {...combined}, {summaryGrouping: "day", durationFormat: "decimal"}),
        ...(["clockify", "toggl", "harvest"] as const).map(framework => preset(
            `Move work to ${framework === "clockify" ? "Clockify" : framework === "toggl" ? "Toggl" : "Harvest"}`,
            "all_time", {...manual}, {format: "csv", framework, summaryGrouping: "none"},
        )),
        preset("Keep a portable copy", "all_time", everythingInclude(), {format: "json"}),
        preset("Investigate tracking discrepancies", "today", {...activity, activity_logs: true, devices: true, activity_categories: true}, {summaryGrouping: "device"}),
        preset("Transfer tracking configuration", "all_time", {
            ...emptyInclude(), activity_categories: true, manual_categories: true, app_groups: true, skipped_apps: true,
        }, {format: "json"}),
    ];
}
