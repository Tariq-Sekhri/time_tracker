import {describe, expect, it} from "vitest";
import {invoke} from "./core";

type ManualTimeBlock = {
    id: number;
    title: string;
    start_time: number;
    end_time: number;
};

type RunningManualTimer = {
    title: string;
    start_time: number;
    end_time: number | null;
};

describe("demo manual time commands", () => {
    it("loads manual time data and starts, records, and reloads a timer", async () => {
        const rangeStart = Math.floor(Date.now() / 1000) - 60;
        const rangeEnd = rangeStart + 3600;

        await expect(invoke<ManualTimeBlock[]>("get_manual_time_blocks", {rangeStart, rangeEnd})).resolves.toEqual([]);

        const timer = await invoke<RunningManualTimer>("start_manual_timer");
        expect(timer.start_time).toBeGreaterThanOrEqual(rangeStart);
        expect(timer.end_time).toBeNull();
        await expect(invoke<RunningManualTimer>("get_running_manual_timer")).resolves.toMatchObject({start_time: timer.start_time, end_time: null});

        await invoke<RunningManualTimer>("update_manual_timer_title", {title: "Demo timer test"});
        const stopped = await invoke<RunningManualTimer>("stop_manual_timer");
        expect(stopped.end_time).toBeGreaterThan(stopped.start_time);
        const id = await invoke<number>("finish_manual_timer");

        await expect(invoke<RunningManualTimer | null>("get_running_manual_timer")).resolves.toBeNull();
        await expect(invoke<ManualTimeBlock[]>("get_manual_time_blocks", {rangeStart, rangeEnd})).resolves.toContainEqual(expect.objectContaining({id, title: "Demo timer test"}));
    });
});
