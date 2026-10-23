import {describe, expect, it} from "vitest";
import type {ExportActivityLog} from "../../../api/dataTransfer.ts";
import {local, options, sampleDataset} from "./fixtures.ts";
import {summarize} from "./summary.ts";

describe("summarize", () => {
    it("groups by top-level manual category and activity category", () => {
        const summary = summarize(sampleDataset(), options(), "category");
        expect(summary.groups.map((g) => [g.key, g.kind, g.total, g.color])).toEqual([
            ["manual:Acme", "manual", 5400, "#f59e0b"],
            ["manual:Admin", "manual", 3000, "#ef4444"],
            ["activity:Coding", "activity", 3000, "#3b82f6"],
            ["manual:Uncategorized", "manual", 420, "#9ca3af"],
        ]);
        expect(summary.manual).toBe(8820);
        expect(summary.activity).toBe(3000);
        expect(summary.total).toBe(11820);
        expect(summary.activeDays).toBe(3);
        expect(summary.activitySource).toBe("sessions");
    });

    it("groups by day and week chronologically", () => {
        const days = summarize(sampleDataset(), options({dateFormat: "us"}), "day");
        expect(days.groups.map((g) => [g.key, g.label, g.manual, g.activity])).toEqual([
            ["2026-03-03", "03/03/2026", 3000, 0],
            ["2026-03-04", "03/04/2026", 5400, 3000],
            ["2026-03-09", "03/09/2026", 420, 0],
        ]);
        const weeks = summarize(sampleDataset(), options(), "week");
        expect(weeks.groups.map((g) => [g.label, g.total])).toEqual([
            ["Week of 2026-03-02", 11400],
            ["Week of 2026-03-09", 420],
        ]);
    });

    it("groups by device with manual time separate", () => {
        const summary = summarize(sampleDataset(), options(), "device");
        expect(summary.groups.map((g) => [g.label, g.kind, g.total])).toEqual([
            ["Manual time", "manual", 8820],
            ["Laptop", "activity", 3000],
        ]);
    });

    it("rounds each entry and sums rounded values", () => {
        const nearest = summarize(sampleDataset(), options({rounding: 15, roundingMode: "nearest"}), "category");
        expect(nearest.manual).toBe((45 + 90 + 0) * 60);
        expect(nearest.activity).toBe(45 * 60);
        expect(nearest.total).toBe(nearest.groups.reduce((sum, g) => sum + g.total, 0));
        const up = summarize(sampleDataset(), options({rounding: 15, roundingMode: "up"}), "none");
        expect(up.manual).toBe((60 + 90 + 15) * 60);
        expect(up.groups).toEqual([]);
        const down = summarize(sampleDataset(), options({rounding: 15, roundingMode: "down"}), "none");
        expect(down.manual).toBe((45 + 90 + 0) * 60);
    });

    it("falls back to activity logs, rounding per group", () => {
        const log = (id: number, minute: number): ExportActivityLog => ({
            device_uuid: "dev-1",
            device_name: "Laptop",
            id,
            app: "Code",
            app_group: null,
            category: "Coding",
            timestamp: local(2026, 3, 5, 10, minute),
            duration: 100,
        });
        const data = {...sampleDataset(), manual_entries: [], activity_sessions: [], activity_logs: [log(1, 0), log(2, 2), log(3, 4)]};
        const summary = summarize(data, options({rounding: 5}), "category");
        expect(summary.activitySource).toBe("logs");
        expect(summary.groups.map((g) => [g.label, g.activity, g.activityCount])).toEqual([["Coding", 300, 3]]);
        expect(summary.activity).toBe(300);
    });
});
