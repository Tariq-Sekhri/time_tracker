import {describe, expect, it} from "vitest";
import {describeRange, fromDateInput, rangeDayCount, rangeError, resolveRange, toDateInput, type RangePreset, type RangeSelection} from "./dateRanges.ts";

const local = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d).getTime() / 1000);
const sel = (preset: RangePreset, customStart = "", customEnd = ""): RangeSelection => ({preset, customStart, customEnd});
// Wednesday, 18 Feb 2026, mid-afternoon.
const now = new Date(2026, 1, 18, 15, 30);

describe("resolveRange", () => {
    it("covers today with an exclusive next-midnight end", () => {
        expect(resolveRange(sel("today"), now)).toEqual({start: local(2026, 2, 18), end: local(2026, 2, 19)});
    });

    it("starts weeks on Monday, including when today is Sunday or Monday", () => {
        expect(resolveRange(sel("this_week"), now)).toEqual({start: local(2026, 2, 16), end: local(2026, 2, 23)});
        expect(resolveRange(sel("this_week"), new Date(2026, 1, 22, 23, 59))).toEqual({start: local(2026, 2, 16), end: local(2026, 2, 23)});
        expect(resolveRange(sel("this_week"), new Date(2026, 1, 16, 0, 0))).toEqual({start: local(2026, 2, 16), end: local(2026, 2, 23)});
        expect(resolveRange(sel("last_week"), now)).toEqual({start: local(2026, 2, 9), end: local(2026, 2, 16)});
    });

    it("handles month boundaries and year rollover", () => {
        expect(resolveRange(sel("this_month"), now)).toEqual({start: local(2026, 2, 1), end: local(2026, 3, 1)});
        expect(resolveRange(sel("last_month"), now)).toEqual({start: local(2026, 1, 1), end: local(2026, 2, 1)});
        expect(resolveRange(sel("last_month"), new Date(2026, 0, 5))).toEqual({start: local(2025, 12, 1), end: local(2026, 1, 1)});
        expect(resolveRange(sel("this_month"), new Date(2026, 11, 31, 23))).toEqual({start: local(2026, 12, 1), end: local(2027, 1, 1)});
    });

    it("handles quarters, including the last quarter", () => {
        expect(resolveRange(sel("this_quarter"), now)).toEqual({start: local(2026, 1, 1), end: local(2026, 4, 1)});
        expect(resolveRange(sel("this_quarter"), new Date(2026, 5, 30))).toEqual({start: local(2026, 4, 1), end: local(2026, 7, 1)});
        expect(resolveRange(sel("this_quarter"), new Date(2026, 10, 3))).toEqual({start: local(2026, 10, 1), end: local(2027, 1, 1)});
    });

    it("handles the year and the last 30 days including today", () => {
        expect(resolveRange(sel("this_year"), now)).toEqual({start: local(2026, 1, 1), end: local(2027, 1, 1)});
        const last30 = resolveRange(sel("last_30_days"), now)!;
        expect(last30).toEqual({start: local(2026, 1, 20), end: local(2026, 2, 19)});
        expect(rangeDayCount(last30)).toBe(30);
    });

    it("uses data bounds for all time and never ends before tomorrow", () => {
        const bounds = {data_start: local(2024, 5, 3) + 3600 * 10, data_end: local(2026, 2, 10) + 60};
        expect(resolveRange(sel("all_time"), now, bounds)).toEqual({start: local(2024, 5, 3), end: local(2026, 2, 19)});
        expect(resolveRange(sel("all_time"), now, {data_start: null, data_end: null})).toEqual({start: local(2026, 2, 18), end: local(2026, 2, 19)});
    });

    it("treats the custom end date as inclusive", () => {
        expect(resolveRange(sel("custom", "2026-03-01", "2026-03-31"), now)).toEqual({start: local(2026, 3, 1), end: local(2026, 4, 1)});
        expect(resolveRange(sel("custom", "2026-03-04", "2026-03-04"), now)).toEqual({start: local(2026, 3, 4), end: local(2026, 3, 5)});
    });

    it("rejects invalid custom ranges", () => {
        expect(resolveRange(sel("custom", "2026-03-10", "2026-03-01"), now)).toBeNull();
        expect(rangeError(sel("custom", "2026-03-10", "2026-03-01"))).toMatch(/before/);
        expect(rangeError(sel("custom", "", "2026-03-01"))).toMatch(/start/);
        expect(rangeError(sel("custom", "2026-02-30", "2026-03-01"))).toMatch(/start/);
        expect(rangeError(sel("this_month"))).toBeNull();
    });
});

describe("date inputs and descriptions", () => {
    it("round-trips local dates", () => {
        expect(toDateInput(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
        expect(fromDateInput("2026-01-05")?.getTime()).toBe(new Date(2026, 0, 5).getTime());
        expect(fromDateInput("2026-13-01")).toBeNull();
        expect(fromDateInput("nope")).toBeNull();
    });

    it("describes ranges in words", () => {
        expect(describeRange({start: local(2026, 3, 1), end: local(2026, 4, 1)})).toBe("Mar 1 – Mar 31, 2026 · 31 days");
        expect(describeRange({start: local(2025, 12, 29), end: local(2026, 1, 5)})).toBe("Dec 29, 2025 – Jan 4, 2026 · 7 days");
        expect(describeRange({start: local(2026, 3, 4), end: local(2026, 3, 5)})).toBe("Mar 4, 2026 · 1 day");
    });
});
