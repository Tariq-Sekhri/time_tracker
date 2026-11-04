import {describe, expect, it} from "vitest";
import {calendarBlocks, clipLog, dateAtHour, dateValue, dayStart, duration, manualUsage, nextDay, rangeFor, rangeDayCount} from "./model";
import type {MobileLog, Settings} from "./api";

const settings: Settings = {day_start_hour: 6, min_app_duration: 0, min_log_duration: 1,
    max_attach_distance: 30, lookahead_window: 60, min_timeblock_duration: 1,
    notes_enabled: true, use_bar_usage_chart: false};
function log(id: number, start: number, end: number, packageName = "app"): MobileLog {
    return {id, package_name: packageName, app_label: "Page", app_name: "App", start_timestamp: start,
        end_timestamp: end, duration: (end - start) / 1000, category: null};
}

describe("Android usage date boundaries", () => {
    it("counts activity before the configured start hour in the previous day", () => {
        expect(dateValue(dayStart(new Date(2026, 9, 15, 5, 59), 6))).toBe("2026-10-14");
        expect(dateValue(dayStart(new Date(2026, 9, 15, 6), 6))).toBe("2026-10-15");
    });
    it("starts the week on Monday, including early Monday activity in the previous week", () => {
        const range = rangeFor("Week", new Date(2026, 9, 12, 5), 6, "", "");
        expect(new Date(range.startMs)).toEqual(new Date(2026, 9, 5, 6));
        expect(new Date(range.endMs)).toEqual(new Date(2026, 9, 12, 6));
    });
    it("makes custom end dates inclusive using local calendar arithmetic", () => {
        const range = rangeFor("Custom", new Date(), 6, "2026-10-01", "2026-10-15");
        expect(new Date(range.startMs)).toEqual(new Date(2026, 9, 1, 6));
        expect(new Date(range.endMs)).toEqual(new Date(2026, 9, 16, 6));
    });
    it("keeps the configured local hour over the daylight-saving transition", () => {
        const start = dateAtHour("2026-10-31", 6);
        const end = nextDay(start);
        expect(end.getHours()).toBe(6);
        expect(dateValue(end)).toBe("2026-11-01");
    });
});

describe("mobile calendar activity", () => {
    it("clips cross-boundary sessions and preserves the original records", () => {
        const source = log(1, 0, 120000);
        expect(clipLog(source, 30000, 90000).duration).toBe(60);
        expect(source.duration).toBe(120);
    });
    it("groups same-app sessions while keeping gaps out of active duration", () => {
        const blocks = calendarBlocks([log(1, 0, 60000), log(2, 90000, 150000), log(3, 65000, 85000, "other")], 0, 200000, settings);
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({start: 0, end: 150000, activeSeconds: 120});
        expect(blocks[0].logs.map(entry => entry.id)).toEqual([1, 2]);
    });
    it("filters short blocks after merging and never merges different apps", () => {
        const blocks = calendarBlocks([log(1, 0, 50000), log(2, 50000, 100000, "other")], 0, 100000,
            {...settings, min_timeblock_duration: 60});
        expect(blocks).toEqual([]);
    });
});


describe("tracking-day average divisor", () => {
    it("does not count the following morning as an extra tracking day", () => {
        expect(rangeDayCount(+new Date(2026, 9, 19, 6), +new Date(2026, 9, 24, 6), 6)).toBe(5);
        expect(rangeDayCount(+new Date(2026, 9, 23, 6), +new Date(2026, 9, 24, 6), 6)).toBe(1);
    });
    it("counts calendar days rather than fixed 24-hour periods across DST", () => {
        expect(rangeDayCount(+new Date(2026, 9, 31, 6), +new Date(2026, 10, 3, 6), 6)).toBe(3);
    });
    it("groups timer time by category and day within the range", () => {
        const start = +new Date(2026, 9, 22, 6), end = +new Date(2026, 9, 24, 6);
        const at = (day: number, hour: number) => +new Date(2026, 9, day, hour) / 1000;
        const result = manualUsage([
            {project_name: "Work", start_time: at(22, 5), end_time: at(22, 7)},
            {project_name: null, start_time: at(23, 9), end_time: at(23, 9) + 1800},
            {project_name: "Work", start_time: at(24, 5), end_time: at(24, 8)},
        ], start, end, 6);
        expect(result.total).toBe(3600 + 1800 + 3600);
        expect(result.apps).toEqual([{packageName: "Work", label: "Work", seconds: 7200}, {packageName: "Uncategorized", label: "Uncategorized", seconds: 1800}]);
        expect(result.days).toEqual([{date: "2026-10-22", seconds: 3600}, {date: "2026-10-23", seconds: 5400}]);
    });
    it("formats durations without zero parts", () => {
        expect([duration(3600), duration(5580), duration(2220), duration(150), duration(9)]).toEqual(["1h", "1h 33m", "37m", "2m 30s", "9s"]);
    });
});
