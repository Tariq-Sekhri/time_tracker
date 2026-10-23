import {describe, expect, it} from "vitest";
import {emptyDataset, localTs, sampleDataset, samplePdfOptions, withLogs} from "./fixtures.ts";
import {buildReportModel, chartBars, computeBuckets} from "./model.ts";
import {makeTheme} from "./theme.ts";

const theme = makeTheme("#2563eb");

describe("PDF report model", () => {
    it("uses sessions rather than also counting their raw logs", () => {
        const source = sampleDataset();
        const dataset = withLogs(source, 30);
        dataset.activity_sessions = source.activity_sessions;
        const report = buildReportModel(dataset, samplePdfOptions(), theme);
        expect(report.activitySource).toBe("sessions");
        expect(report.totals.activity).toBe(dataset.activity_sessions.reduce((sum, row) => sum + row.duration, 0));
        expect(report.totals.total).toBe(report.totals.manual + report.totals.activity);
    });

    it("rounds manual rows before aggregation and preserves category/chart totals", () => {
        const report = buildReportModel(sampleDataset(), samplePdfOptions({}, {rounding: 15, roundingMode: "up"}), theme);
        expect(report.manual.every(row => row.seconds % 900 === 0)).toBe(true);
        expect(report.categories.reduce((sum, row) => sum + row.seconds, 0)).toBe(report.totals.total);
        expect(chartBars(report.categories, 4).reduce((sum, bar) => sum + bar.seconds, 0)).toBe(report.totals.total);
        expect(report.buckets.reduce((sum, row) => sum + row.manual + row.activity, 0)).toBe(report.totals.total);
    });

    it("does not round second-long raw activity samples", () => {
        const dataset = withLogs(emptyDataset(), 10);
        const report = buildReportModel(dataset, samplePdfOptions({}, {rounding: 15, roundingMode: "up"}), theme);
        expect(report.activitySource).toBe("logs");
        expect(report.totals.activity).toBe(dataset.activity_logs.reduce((sum, row) => sum + row.duration, 0));
    });

    it("handles a large all-time activity archive without exceeding the argument limit", () => {
        const dataset = emptyDataset(0, 2_000_000_000);
        const timestamp = localTs(2026, 10, 1, 9);
        dataset.activity_logs = Array.from({length: 200_000}, (_, id) => ({
            device_uuid: "work", device_name: "Work", id, app: "Editor", app_group: null,
            category: "Work", timestamp: timestamp + id, duration: 1,
        }));
        const report = buildReportModel(dataset, samplePdfOptions(), theme);
        expect(report.totals.activity).toBe(200_000);
        expect(report.rangeStart).toBe(localTs(2026, 10, 1));
        expect(report.rangeEnd).toBe(localTs(2026, 10, 4));
    });

    it("chooses weekly buckets for a long report and keeps chronological totals", () => {
        const start = localTs(2026, 1, 1);
        const result = computeBuckets([{start, seconds: 3600}], [], start, localTs(2026, 5, 1));
        expect(result.unit).toBe("week");
        expect(result.buckets.reduce((sum, row) => sum + row.manual, 0)).toBe(3600);
        expect(result.buckets.every((row, index) => index === 0 || row.start > result.buckets[index - 1].start)).toBe(true);
    });
});
