import {DEFAULT_INVOICE} from "../formats/export/invoice.ts";
import type {ExportInclude} from "../../api/dataTransfer.ts";
import {defaultExportOptions} from "../formats/index.ts";
import type {ExportOptions} from "../types.ts";
import type {RangePreset} from "./dateRanges.ts";
import type {ExportPreset} from "./presets.ts";
import {ALL_FILTERS, emptyInclude, everythingInclude, timesheetInclude} from "./scope.ts";

export type BuiltInExportPreset = ExportPreset;

function preset(name: string, range: RangePreset, include: ExportInclude, patch: Partial<ExportOptions> = {}): BuiltInExportPreset {
    return {
        name,
        scopeTemplate: {range: {preset: range, customStart: "", customEnd: ""}, filters: {...ALL_FILTERS}, include},
        options: {...defaultExportOptions(), ...patch},
    };
}

/** Starting points for common jobs. Kept separate from the user's saved presets. */
export function builtInExportPresets(): BuiltInExportPreset[] {
    const manual = timesheetInclude();
    const pdf = (title: string, signature = false): ExportOptions["pdf"] => {
        const defaults = defaultExportOptions().pdf;
        return {...defaults, title, sections: {...defaults.sections, signature}};
    };
    return [
        preset("Archiver", "all_time", everythingInclude(), {format: "json"}),
        preset("Invoice", "last_month", {...manual}, {
            format: "pdf", durationFormat: "decimal", pdf: {...pdf("Invoice"), layout: "invoice", invoice: {...DEFAULT_INVOICE}},
        }),
        preset("Timesheet", "last_week", {...manual}, {summaryGrouping: "day"}),
        preset("Settings & rules", "all_time", {
            ...emptyInclude(), activity_categories: true, manual_categories: true, app_groups: true, skipped_apps: true,
        }, {format: "json"}),
    ];
}
