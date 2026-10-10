import {afterEach, describe, expect, it, vi} from "vitest";
import {buildSeries, buildTopAppSeries} from "./trendModel.ts";
import {beforeEach} from "vitest";
import type {TrendWeekStatistics} from "../../api/statistics.ts";

const start = Math.floor(new Date(2026, 8, 14, 4).getTime() / 1000);
const weeks = Array.from({length: 3}, (_, i) => ({week_start: start + i * 604800, week_end: start + (i + 1) * 604800 - 1}));
function stats(categories: Record<string, number>, apps: Record<string, number> = {}): TrendWeekStatistics {
    return {
        total_time: Object.values(categories).reduce((a, b) => a + b, 0),
        categories: Object.entries(categories).map(([category, total_duration]) => ({category, total_duration, color: "#abcdef", percentage: 0, percentage_change: null})),
        all_apps: Object.entries(apps).map(([app, total_duration]) => ({app, total_duration, app_names: [app + " title"], percentage_change: null})),
    };
}
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 12));
});
afterEach(() => vi.useRealTimers());

describe("compact trend chart model", () => {
    it("keeps category totals, absent-week zeros, colors, and descending ranking", () => {
        const model = buildSeries(weeks, [stats({Work: 30}), stats({Fun: 90}), stats({Work: 20, Fun: 10})], "total", 4);
        expect(model.series.map(s => s.category)).toEqual(["Fun", "Work"]);
        expect(model.series[0].values).toEqual([0, 90, 10]);
        expect(model.series[1].values).toEqual([30, 0, 20]);
        expect(model.series[0].color).toBe("#abcdef");
        expect(model.totalLineValues).toEqual([30, 90, 30]);
        expect(model.columns.map(c => c.week_start)).toEqual(weeks.map(w => w.week_start));
    });

    it("ranks apps within each week and leaves out-of-top-list values null for dotted gaps", () => {
        const model = buildTopAppSeries(weeks, [stats({Work: 300}, {A: 100, B: 90}), stats({Work: 300}, {B: 120, A: 10}), stats({Work: 300}, {A: 100, B: 50})], "total", 4, 1);
        expect(model.series.map(s => s.category)).toEqual(["A", "B"]);
        expect(model.series[0].values).toEqual([100, null, 100]);
        expect(model.series[1].values).toEqual([null, 120, null]);
        expect(model.totalLineValues).toEqual([300, 300, 300]);
    });

    it("uses tracked calendar days for averages and caps the current week at today", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 30, 12));
        const model = buildSeries(weeks, [stats({Work: 700}), stats({Work: 1400}), stats({Work: 900})], "avg", 4);
        expect(model.series[0].values).toEqual([100, 200, 300]);
        expect(model.totalLineValues).toEqual([100, 200, 300]);
    });

    it.each([buildSeries, buildTopAppSeries])("normalizes incomplete weeks so weekly values are seven times daily values", (build) => {
        vi.setSystemTime(new Date(2026, 8, 30, 3)); // Before the 4am boundary: two tracked days.
        const data = [stats({Work: 701}, {A: 701}), stats({Work: 1401}, {A: 1401}), stats({Work: 901}, {A: 901})];
        const daily = build(weeks, data, "avg", 4, 1);
        const weekly = build(weeks, data, "total", 4, 1);
        expect(daily.series[0].values[2]).toBe(450.5);
        expect(weekly.series[0].values[0]).toBe(701);
        expect(weekly.series[0].values[2]).toBe(3153.5);
        weekly.series[0].values.forEach((value, index) => {
            expect(value).toBeCloseTo(daily.series[0].values[index]! * 7);
        });
        weekly.totalLineValues.forEach((value, index) => {
            expect(value).toBeCloseTo(daily.totalLineValues[index] * 7);
        });
    });

    it("does not mutate backend app order or data when selecting top apps", () => {
        const data = stats({Work: 100}, {small: 10, large: 90});
        const original = JSON.stringify(data);
        buildTopAppSeries([weeks[0]], [data], "total", 4, 1);
        expect(JSON.stringify(data)).toBe(original);
    });
    it("selects top apps by range totals and includes weeks below the weekly cutoff and zero-usage weeks", () => {
        const data = [stats({Work: 200}, {A: 100, B: 90}), stats({Work: 200}, {B: 120, A: 10}), stats({Work: 200}, {A: 100, C: 150})];
        const original = JSON.stringify(data);
        const model = buildTopAppSeries(weeks, data, "total", 4, 2, "range");
        expect(model.series.map(s => s.category)).toEqual(["A", "B"]);
        expect(model.series[0].values).toEqual([100, 10, 100]);
        expect(model.series[1].values).toEqual([90, 120, 0]);
        expect(model.totalLineValues).toEqual([200, 200, 200]);
        expect(JSON.stringify(data)).toBe(original);
    });
    it("ranks range apps by raw total time rather than normalized incomplete-week values", () => {
        vi.setSystemTime(new Date(2026, 8, 28, 12));
        const data = [stats({Work: 100}, {A: 100}), stats({Work: 100}, {A: 100}), stats({Work: 90}, {B: 90})];
        const daily = buildTopAppSeries(weeks, data, "avg", 4, 1, "range");
        const weekly = buildTopAppSeries(weeks, data, "total", 4, 1, "range");
        expect(daily.series.map(s => s.category)).toEqual(["A"]);
        expect(weekly.series.map(s => s.category)).toEqual(["A"]);
        expect(weekly.series[0].values).toEqual([100, 100, 0]);
        expect(weekly.totalLineValues[2]).toBe(630);
    });
    it("preserves stable backend order for equal-duration apps at the cutoff", () => {
        const data = stats({Work: 100}, {first: 10, second: 10, third: 10, winner: 30});
        const model = buildTopAppSeries([weeks[0]], [data], "total", 4, 2);
        expect(model.series.map(s => s.category)).toEqual(["winner", "first"]);
    });
});
