import {describe, expect, it} from "vitest";
import {invoke} from "./core";
import type {WeekStatistics, DayStatistics} from "../../src/api/statistics";

describe("isolated statistics", () => {
    it("scopes week and day totals and app lists before aggregation", async () => {
        const end = Math.floor(Date.now() / 1000);
        const start = end - 30 * 86400;
        const base = await invoke<WeekStatistics>("get_week_statistics", {weekStart: start, weekEnd: end, includeManual: false});
        expect(base.categories.length).toBeGreaterThan(1);
        const category = base.categories[0];
        for (const command of ["get_week_statistics", "get_day_statistics"]) {
            const args = {weekStart: start, weekEnd: end, dayStart: start, dayEnd: end, includeManual: false};
            const scoped = await invoke<WeekStatistics | DayStatistics>(command, {...args, categoryNames: [category.category]});
            expect(scoped.categories.map(c => c.category)).toEqual([category.category]);
            expect(scoped.total_time).toBe(category.total_duration);
            const apps = "all_apps" in scoped ? scoped.all_apps : scoped.top_apps;
            expect(apps.reduce((sum, app) => sum + app.total_duration, 0)).toBeLessThanOrEqual(scoped.total_time);
            expect(apps.length).toBeGreaterThan(0);
            const excluded = await invoke<WeekStatistics | DayStatistics>(command, {...args, categoryNames: []});
            expect(excluded.total_time).toBe(0);
            expect(excluded.categories).toEqual([]);
            expect(excluded.top_apps).toEqual([]);
            const noDevices = await invoke<WeekStatistics | DayStatistics>(command, {...args, categoryNames: [category.category], deviceUuids: []});
            expect(noDevices.total_time).toBe(0);
        }
    });
});
