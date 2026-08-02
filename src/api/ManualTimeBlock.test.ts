import {describe, expect, it} from "vitest";
import {manualTimeDurationInRange} from "./ManualTimeBlock.ts";

describe("manualTimeDurationInRange", () => {
    it("counts only the part of a manual block inside the requested range", () => {
        expect(manualTimeDurationInRange({start_time: 50, end_time: 150}, 100, 200)).toBe(50);
        expect(manualTimeDurationInRange({start_time: 120, end_time: 180}, 100, 200)).toBe(60);
        expect(manualTimeDurationInRange({start_time: 250, end_time: 300}, 100, 200)).toBe(0);
    });
});
