import {describe, expect, it} from "vitest";
import {timeBlockDetailLogs} from "./timeBlockEngine.ts";

describe("time-block detail logs", () => {
    it("keeps video titles separate, aggregates only identical titles, and preserves devices", () => {
        const rows = timeBlockDetailLogs([
            {id: 1, device_uuid: "desktop", app: "First video - YouTube", timestamp: 100, duration: 30},
            {id: 2, device_uuid: "desktop", app: "Second video - YouTube", timestamp: 140, duration: 40},
            {id: 3, device_uuid: "desktop", app: "First video - YouTube", timestamp: 200, duration: 10},
            {id: 1, device_uuid: "phone", app: "First video - YouTube", timestamp: 100, duration: 20},
        ]);
        expect(rows).toHaveLength(3);
        expect(rows).toContainEqual({ids: [1, 3], device_uuid: "desktop", app: "First video - YouTube", app_names: ["First video - YouTube"], timestamp: 100, duration: 40});
        expect(rows).toContainEqual({ids: [1], device_uuid: "phone", app: "First video - YouTube", app_names: ["First video - YouTube"], timestamp: 100, duration: 20});
        expect(rows.reduce((sum, row) => sum + row.duration, 0)).toBe(100);
    });
});
