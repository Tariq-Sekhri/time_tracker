import {describe, expect, it} from "vitest";
import {manualTimeAppStats, manualTimeDurationInRange, manualTimeCategoryStats, type ManualTimeBlock} from "./ManualTimeBlock.ts";

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
    it("rolls subcategory time into its category and labels it with the subcategory", () => {
        const base: ManualTimeBlock = {id: 1, title: "Essay", notes: null, project_id: 1, project_name: "School", project_color: "#fb7185", start_time: 0, end_time: 60, created_at: 1, updated_at: 1};
        const homework = {...base, id: 2, project_id: 2, project_name: "Homework", project_color: "#22d3ee", parent_project_name: "School", parent_project_color: "#fb7185"};
        expect(manualTimeCategoryStats([base, homework], 0, 100)).toEqual([{category: "School", total_duration: 120, color: "#fb7185"}]);
        expect(manualTimeAppStats([homework], 0, 100)).toEqual([expect.objectContaining({app: "Manual time: Homework · Essay", total_duration: 60})]);
    });
});
