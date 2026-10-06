import {describe, expect, it} from "vitest";
import {manualTimeDurationInRange, manualTimeCategoryStats, type ManualTimeBlock} from "./ManualTimeBlock.ts";

describe("manualTimeDurationInRange", () => {
    it("counts only the part of a manual block inside the requested range", () => {
        expect(manualTimeDurationInRange({start_time: 50, end_time: 150}, 100, 200)).toBe(50);
        expect(manualTimeDurationInRange({start_time: 120, end_time: 180}, 100, 200)).toBe(60);
        expect(manualTimeDurationInRange({start_time: 250, end_time: 300}, 100, 200)).toBe(0);
    });
    it("groups clipped and overlapping manual durations by project for calendar stats", () => {
        const base: ManualTimeBlock = {id: 1, title: "Unnamed", notes: null, start_time: 50, end_time: 150, created_at: 1, updated_at: 1};
        const rows = manualTimeCategoryStats([base, {...base, id: 2, project_id: 7, project_name: "Client", start_time: 100, end_time: 200}, {...base, id: 3, project_id: 7, project_name: "Client", start_time: 120, end_time: 180}], 100, 200);
        expect(rows).toContainEqual(expect.objectContaining({category: "Manual time", total_duration: 50}));
        expect(rows).toContainEqual(expect.objectContaining({category: "Client", total_duration: 160}));
    });
});
