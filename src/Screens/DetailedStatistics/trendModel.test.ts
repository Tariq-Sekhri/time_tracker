import {afterEach, describe, expect, it, vi} from "vitest";
import {buildSeries, buildTopAppSeries} from "./trendModel.ts";
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

    it("does not mutate backend app order or data when selecting top apps", () => {
        const data = stats({Work: 100}, {small: 10, large: 90});
        const original = JSON.stringify(data);
        buildTopAppSeries([weeks[0]], [data], "total", 4, 1);
        expect(JSON.stringify(data)).toBe(original);
    });
    it("preserves stable backend order for equal-duration apps at the cutoff", () => {
        const data = stats({Work: 100}, {first: 10, second: 10, third: 10, winner: 30});
        const model = buildTopAppSeries([weeks[0]], [data], "total", 4, 2);
        expect(model.series.map(s => s.category)).toEqual(["winner", "first"]);
    });
});
