import type {ExportDataset, ExportManualEntry} from "../../../api/dataTransfer.ts";
import type {ExportOptions} from "../../types.ts";
import {defaultExportOptions} from "./index.ts";

/** Test helpers: timestamps built from LOCAL date components so tests pass in any time zone. */
export const local = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
    Math.floor(new Date(year, month - 1, day, hour, minute, second).getTime() / 1000);

export function entry(overrides: Partial<ExportManualEntry> & {start_time: number; end_time: number}): ExportManualEntry {
    return {
        id: 1,
        title: "Work",
        notes: null,
        category_id: 2,
        category: "Website",
        parent_category: "Acme",
        category_color: "#22c55e",
        duration: overrides.end_time - overrides.start_time,
        created_at: overrides.start_time,
        updated_at: overrides.start_time,
        ...overrides,
    };
}

export function sampleDataset(): ExportDataset {
    return {
        generated_at: local(2026, 3, 10, 18, 0),
        app_version: "1.12.7",
        range_start: local(2026, 3, 1),
        range_end: local(2026, 4, 1),
        manual_entries: [
            entry({id: 2, title: "Design review", notes: "With \"Bob\", Alice", start_time: local(2026, 3, 4, 14, 5), end_time: local(2026, 3, 4, 15, 35)}),
            entry({
                id: 1,
                title: "=SUM(A1)",
                category_id: 5,
                category: "Admin",
                parent_category: null,
                category_color: "#ef4444",
                start_time: local(2026, 3, 3, 9, 0),
                end_time: local(2026, 3, 3, 9, 50),
            }),
            entry({
                id: 3,
                title: "Misc",
                category_id: null,
                category: "Uncategorized",
                parent_category: null,
                category_color: "#9ca3af",
                start_time: local(2026, 3, 9, 8, 0),
                end_time: local(2026, 3, 9, 8, 7),
            }),
        ],
        activity_sessions: [
            {
                device_uuid: "dev-1",
                device_name: "Laptop",
                category: "Coding",
                category_color: "#3b82f6",
                start_time: local(2026, 3, 4, 10, 0),
                end_time: local(2026, 3, 4, 11, 0),
                duration: 3600,
                active_duration: 3000,
                apps: [
                    {app: "Code", duration: 2400},
                    {app: "Chrome", duration: 600},
                ],
            },
        ],
        activity_logs: [],
        devices: [{uuid: "dev-1", name: "Laptop", kind: "local", in_cal: true, in_stats: false}],
        activity_categories: [{name: "Coding", color: "#3b82f6", priority: 1, is_visible: true, in_stats: true, rules: ["code", "vim"]}],
        manual_categories: [
            {id: null, name: "Uncategorized", color: "#9ca3af", parent_id: null, parent_name: null, priority: 0, rules: []},
            {id: 1, name: "Acme", color: "#f59e0b", parent_id: null, parent_name: null, priority: 0, rules: []},
            {id: 2, name: "Website", color: "#22c55e", parent_id: 1, parent_name: "Acme", priority: 0, rules: []},
            {id: 5, name: "Admin", color: "#ef4444", parent_id: null, parent_name: null, priority: 0, rules: []},
        ],
        app_groups: [{name: "Browsers", regex: "chrome|firefox"}],
        skipped_apps: ["^Lock screen$"],
    };
}

export function options(overrides: Partial<ExportOptions> = {}): ExportOptions {
    return {...defaultExportOptions(), ...overrides};
}
