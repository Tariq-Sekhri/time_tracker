import {describe, expect, it} from "vitest";
import {builtInExportPresets} from "./builtInPresets.ts";
import {everythingInclude} from "./scope.ts";

describe("built-in export presets", () => {
    it("keeps portable copies complete and configuration transfers free of activity records", () => {
        const presets = builtInExportPresets();
        const portable = presets.find(item => item.name === "Keep a portable copy")!;
        expect(portable.scopeTemplate.include).toEqual(everythingInclude());
        expect(portable.scopeTemplate.range.preset).toBe("all_time");
        expect(portable.options.format).toBe("json");
        const configuration = presets.find(item => item.name === "Transfer tracking configuration")!;
        expect(configuration.options.format).toBe("json");
        expect(configuration.scopeTemplate.include).toMatchObject({manual_entries: false, activity_sessions: false, activity_logs: false, devices: false, activity_categories: true, manual_categories: true, app_groups: true, skipped_apps: true});
    });

    it("uses exact manual time for billing and only manual entries for external tools", () => {
        const presets = builtInExportPresets();
        const invoice = presets.find(item => item.name === "Support an invoice")!;
        expect(invoice.scopeTemplate.include).toMatchObject({manual_entries: true, activity_sessions: false, activity_logs: false});
        expect(invoice.options.rounding).toBe(0);
        for (const framework of ["clockify", "toggl", "harvest"]) {
            const preset = presets.find(item => item.options.framework === framework)!;
            expect(preset.options).toMatchObject({format: "csv", summaryGrouping: "none", rounding: 0});
            expect(Object.entries(preset.scopeTemplate.include).filter(([, selected]) => selected).map(([key]) => key)).toEqual(["manual_entries"]);
        }
    });
});
