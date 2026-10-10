import {describe, expect, it} from "vitest";
import {enumerateWeekRangesInSpan, getWeekRange} from "./utils.ts";

describe("trend week ranges", () => {
    it("keeps the entire selected range, including weeks older than 24 weeks", () => {
        const start = new Date(2026, 0, 22, 12);
        const end = new Date(2026, 9, 9, 12);
        const weeks = enumerateWeekRangesInSpan(start, end, 4);

        expect(weeks).toHaveLength(38);
        expect(weeks[0]).toEqual(getWeekRange(start, 4));
        expect(weeks[weeks.length - 1]).toEqual(getWeekRange(end, 4));
        for (let index = 1; index < weeks.length; index++) {
            expect(weeks[index].week_start).toBe(weeks[index - 1].week_end + 1);
        }
    });
});
