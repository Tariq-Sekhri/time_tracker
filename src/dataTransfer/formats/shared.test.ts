import {describe, expect, it} from "vitest";
import {dayKey, formatDate, formatDuration, formatTime, humanDuration, roundDuration, safeFileStem, weekKey} from "./shared.ts";

const local = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime() / 1000;

describe("roundDuration", () => {
    it("keeps exact durations when rounding is off", () => {
        expect(roundDuration(125, 0, "nearest")).toBe(125);
    });
    it("rounds to the nearest, up or down multiple", () => {
        expect(roundDuration(7 * 60, 15, "nearest")).toBe(0);
        expect(roundDuration(8 * 60, 15, "nearest")).toBe(15 * 60);
        expect(roundDuration(60, 6, "up")).toBe(6 * 60);
        expect(roundDuration(14 * 60, 15, "down")).toBe(0);
    });
});

describe("formatDuration", () => {
    it("formats every style", () => {
        expect(formatDuration(3723, "hms")).toBe("1:02:03");
        expect(formatDuration(3723, "hm")).toBe("1:02");
        expect(formatDuration(3599 + 31, "hm")).toBe("1:01");
        expect(formatDuration(3570, "hm")).toBe("1:00");
        expect(formatDuration(5400, "decimal")).toBe("1.50");
    });
    it("gives short report labels", () => {
        expect(humanDuration(45 * 60)).toBe("45m");
        expect(humanDuration(3 * 3600 + 5 * 60)).toBe("3h 05m");
    });
});

describe("dates", () => {
    const ts = local(2026, 3, 4, 14, 5, 9);
    it("formats local dates and times", () => {
        expect(formatDate(ts, "iso")).toBe("2026-03-04");
        expect(formatDate(ts, "us")).toBe("03/04/2026");
        expect(formatDate(ts, "eu")).toBe("04/03/2026");
        expect(formatTime(ts, "24h")).toBe("14:05:09");
        expect(formatTime(ts, "12h")).toBe("2:05:09 PM");
        expect(formatTime(local(2026, 3, 4, 0, 1), "12h")).toBe("12:01:00 AM");
    });
    it("keys days and Monday-start weeks", () => {
        expect(dayKey(ts)).toBe("2026-03-04");
        expect(weekKey(ts)).toBe("2026-03-02");
        expect(weekKey(local(2026, 3, 8, 23))).toBe("2026-03-02");
    });
    it("makes safe file names", () => {
        expect(safeFileStem("  Time Report: Acme / Q1 ")).toBe("time-report-acme-q1");
        expect(safeFileStem("***")).toBe("export");
    });
});
