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


describe("manual time statistics", () => {
    it("adds overlapping blocks to totals, charts and titles while preserving notes through edits", async () => {
        const start = Math.floor(Date.now() / 1000) - 86400;
        const end = start + 7200;
        type Stats = {total_time: number; total_time_all_time: number; categories: {category: string; total_duration: number}[];
            all_apps: {app: string; total_duration: number}[]; hourly_distribution: {total_duration: number}[]};
        const args = {weekStart: start, weekEnd: end};
        const before = await invoke<Stats>("get_week_statistics", args);
        const lifetime = await invoke<Stats>("get_total_statistics");
        const ids: number[] = [];
        try {
            for (let i = 0; i < 2; i++) ids.push(await invoke<number>("insert_manual_time_block", {
                newManualTimeBlock: {title: "Overlap statistics test", notes: "Important notes", start_time: start - 900, end_time: start + 3600}
            }));
            const after = await invoke<Stats>("get_week_statistics", args);
            expect(after.total_time - before.total_time).toBe(7200);
            expect(after.categories.find((c) => c.category === "Manual time")!.total_duration - (before.categories.find((c) => c.category === "Manual time")?.total_duration ?? 0)).toBe(7200);
            expect(after.all_apps.find((a) => a.app === "Manual time: Overlap statistics test")?.total_duration).toBe(7200);
            expect(after.hourly_distribution.reduce((sum, h) => sum + h.total_duration, 0) - before.hourly_distribution.reduce((sum, h) => sum + h.total_duration, 0)).toBe(7200);
            expect((await invoke<Stats>("get_total_statistics")).total_time_all_time - lifetime.total_time_all_time).toBe(9000);
            expect((await invoke<Stats>("get_week_statistics", {...args, includeManual: false})).categories.some((c) => c.category === "Manual time")).toBe(false);
            await invoke("update_manual_time_block", {manualTimeBlock: {id: ids[0], title: "Edited manual title", notes: "Important notes", start_time: start, end_time: start + 1800}});
            const edited = await invoke<Stats>("get_week_statistics", args);
            expect(edited.total_time - before.total_time).toBe(5400);
            expect(edited.all_apps.find((a) => a.app === "Manual time: Edited manual title")?.total_duration).toBe(1800);
            const blocks = await invoke<Array<{id: number; notes: string}>>("get_manual_time_blocks", {rangeStart: start, rangeEnd: end});
            expect(blocks.find((b) => b.id === ids[0])?.notes).toBe("Important notes");
        } finally {
            for (const id of ids) await invoke("delete_manual_time_block", {id});
        }
        expect((await invoke<Stats>("get_week_statistics", args)).total_time).toBe(before.total_time);
    });
});
