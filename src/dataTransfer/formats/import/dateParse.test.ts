import {describe, expect, it} from "vitest";
import {inferDayOrder, parseDate, parseDateTime, parseDuration, parseTime, toUnix} from "./dateParse.ts";

const ymd = (y: number, m: number, d: number) => ({y, m, d});

describe("parseDate", () => {
    it("reads ISO and year-first dates", () => {
        expect(parseDate("2026-03-04", "us")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("2026/3/4", "eu")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("2026.03.04", "us")).toEqual(ymd(2026, 3, 4));
    });

    it("reads numeric dates in the requested order, falling back when impossible", () => {
        expect(parseDate("03/04/2026", "us")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("03/04/2026", "eu")).toEqual(ymd(2026, 4, 3));
        expect(parseDate("04.03.2026", "eu")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("25/03/2026", "us")).toEqual(ymd(2026, 3, 25));
        expect(parseDate("3/4/26", "us")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("04-03-2026", "eu")).toEqual(ymd(2026, 3, 4));
    });

    it("reads month names", () => {
        expect(parseDate("Mar 4, 2026", "eu")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("4 March 2026", "us")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("Wed, 4-Mar-26", "us")).toEqual(ymd(2026, 3, 4));
        expect(parseDate("September 30th 2026", "us")).toEqual(ymd(2026, 9, 30));
        expect(parseDate("Sept 1 2026", "us")).toEqual(ymd(2026, 9, 1));
    });

    it("rejects impossible dates", () => {
        expect(parseDate("2026-02-30", "us")).toBeNull();
        expect(parseDate("13/13/2026", "us")).toBeNull();
        expect(parseDate("Smarch 4 2026", "us")).toBeNull();
        expect(parseDate("hello", "us")).toBeNull();
    });
});

describe("parseTime", () => {
    it("reads 24h and 12h times", () => {
        expect(parseTime("14:05")).toBe(14 * 3600 + 5 * 60);
        expect(parseTime("14:05:09")).toBe(14 * 3600 + 5 * 60 + 9);
        expect(parseTime("09:00:00.000")).toBe(9 * 3600);
        expect(parseTime("14h05")).toBe(14 * 3600 + 5 * 60);
        expect(parseTime("2:05 PM")).toBe(14 * 3600 + 5 * 60);
        expect(parseTime("2:05:09 pm")).toBe(14 * 3600 + 5 * 60 + 9);
        expect(parseTime("12:30 AM")).toBe(30 * 60);
        expect(parseTime("12:30 p.m.")).toBe(12 * 3600 + 30 * 60);
        expect(parseTime("9 am")).toBe(9 * 3600);
        expect(parseTime("24:00")).toBe(86400);
    });

    it("rejects invalid times", () => {
        expect(parseTime("25:99")).toBeNull();
        expect(parseTime("13:00 PM")).toBeNull();
        expect(parseTime("14")).toBeNull();
        expect(parseTime("")).toBeNull();
    });
});

describe("parseDateTime", () => {
    it("reads combined values and honours offsets", () => {
        expect(parseDateTime("2026-03-04T09:15:30", "us")).toEqual({date: ymd(2026, 3, 4), time: 9 * 3600 + 15 * 60 + 30, offset: null});
        expect(parseDateTime("2026-03-04 09:15", "us")).toEqual({date: ymd(2026, 3, 4), time: 9 * 3600 + 15 * 60, offset: null});
        expect(parseDateTime("2026-03-04T09:15:00Z", "us")?.offset).toBe(0);
        expect(parseDateTime("2026-03-04T09:15:00+05:30", "us")?.offset).toBe(330);
        expect(parseDateTime("2026-03-04T09:15:00.123-0400", "us")?.offset).toBe(-240);
        expect(parseDateTime("03/04/2026 2:05 PM", "eu")).toEqual({date: ymd(2026, 4, 3), time: 14 * 3600 + 5 * 60, offset: null});
        expect(parseDateTime("Mar 4, 2026, 2:05 PM", "us")).toEqual({date: ymd(2026, 3, 4), time: 14 * 3600 + 5 * 60, offset: null});
        expect(parseDateTime("4 March 2026 at 14:05", "us")).toEqual({date: ymd(2026, 3, 4), time: 14 * 3600 + 5 * 60, offset: null});
        expect(parseDateTime("2026-03-04 2:05 PM", "us")).toEqual({date: ymd(2026, 3, 4), time: 14 * 3600 + 5 * 60, offset: null});
    });

    it("returns partial values", () => {
        expect(parseDateTime("14:05", "us")).toEqual({date: null, time: 14 * 3600 + 5 * 60, offset: null});
        expect(parseDateTime("2026-03-04", "us")).toEqual({date: ymd(2026, 3, 4), time: null, offset: null});
        expect(parseDateTime("nonsense", "us")).toBeNull();
    });

    it("converts to unix seconds in local time or with the given offset", () => {
        expect(toUnix(ymd(2026, 3, 4), 9 * 3600 + 15 * 60, null)).toBe(new Date(2026, 2, 4, 9, 15).getTime() / 1000);
        expect(toUnix(ymd(2026, 3, 4), 9 * 3600, 0)).toBe(Date.UTC(2026, 2, 4, 9) / 1000);
        expect(toUnix(ymd(2026, 3, 4), 9 * 3600, 60)).toBe(Date.UTC(2026, 2, 4, 8) / 1000);
        expect(toUnix(ymd(2026, 3, 31), 3600, null, 1)).toBe(new Date(2026, 3, 1, 1).getTime() / 1000);
    });
});

describe("parseDuration", () => {
    it("reads clock, unit and decimal formats", () => {
        expect(parseDuration("1:30:00")).toBe(5400);
        expect(parseDuration("26:00:05")).toBe(26 * 3600 + 5);
        expect(parseDuration("1:30")).toBe(5400);
        expect(parseDuration("1h 30m")).toBe(5400);
        expect(parseDuration("1h30")).toBe(5400);
        expect(parseDuration("1 hr 30 mins")).toBe(5400);
        expect(parseDuration("2 hours, 5 minutes")).toBe(7500);
        expect(parseDuration("90m")).toBe(5400);
        expect(parseDuration("45s")).toBe(45);
        expect(parseDuration("PT1H30M")).toBe(5400);
        expect(parseDuration("1.5")).toBe(5400);
        expect(parseDuration("1,5")).toBe(5400);
        expect(parseDuration(".25")).toBe(900);
        expect(parseDuration("90", "minutes")).toBe(5400);
        expect(parseDuration("5400", "seconds")).toBe(5400);
    });

    it("rejects garbage and negatives", () => {
        expect(parseDuration("abc")).toBeNull();
        expect(parseDuration("-1")).toBeNull();
        expect(parseDuration("1:75")).toBeNull();
        expect(parseDuration("1 parsec")).toBeNull();
        expect(parseDuration("")).toBeNull();
    });
});

describe("inferDayOrder", () => {
    it("decides from unambiguous values", () => {
        expect(inferDayOrder(["03/04/2026", "13/04/2026"]).order).toBe("eu");
        expect(inferDayOrder(["03/04/2026", "03/14/2026"]).order).toBe("us");
        expect(inferDayOrder(["03/04/2026", "05/06/2026"]).order).toBeNull();
        expect(inferDayOrder(["13/04/2026", "03/14/2026"]).order).toBeNull();
        expect(inferDayOrder(["04.03.2026"]).dot).toBe(true);
        expect(inferDayOrder(["2026-03-04"]).seen).toBe(false);
    });
});
