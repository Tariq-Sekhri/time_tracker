import {describe, expect, it} from "vitest";
import {invoke} from "./core";

describe("demo Settings and Notes commands", () => {
    it("keeps note preferences and content within the demo session", async () => {
        await invoke("set_notes_enabled", {enabled: true});
        await invoke("set_notes_text", {text: "Demo note"});
        await expect(invoke("get_notes_state")).resolves.toEqual({enabled: true, text: "Demo note"});
        await invoke("set_notes_enabled", {enabled: false});
        await expect(invoke("get_notes_state")).resolves.toEqual({enabled: false, text: "Demo note"});
        await invoke("set_notes_text", {text: ""});
    });
});

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
    it("renames projects and removes assignments without deleting recorded or running time", async () => {
        const id = await invoke<number>("create_manual_project", {name: "Project lifecycle"});
        const start = Math.floor(Date.now() / 1000) - 600;
        const blockId = await invoke<number>("insert_manual_time_block", {newManualTimeBlock: {title: "Past work", notes: "Keep these notes", project_id: id, start_time: start, end_time: start + 300}});
        await invoke("start_manual_timer", {title: "Current work", projectId: id});
        await invoke("update_manual_project", {id, name: "Renamed project"});
        await expect(invoke("get_manual_projects")).resolves.toContainEqual({id, name: "Renamed project"});
        await invoke("delete_manual_project", {id});
        await expect(invoke("get_manual_time_blocks", {rangeStart: start, rangeEnd: start + 600})).resolves.toContainEqual(expect.objectContaining({id: blockId, title: "Past work", notes: "Keep these notes", project_id: null, end_time: start + 300}));
        await expect(invoke("get_running_manual_timer")).resolves.toMatchObject({title: "Current work", project_id: null, end_time: null});
        await invoke("stop_manual_timer");
        const finishedId = await invoke<number>("finish_manual_timer");
        await invoke("delete_manual_time_block", {id: blockId});
        await invoke("delete_manual_time_block", {id: finishedId});
    });
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
    it("splits manual time by project, refreshes renamed categories, and keeps deleted project time", async () => {
        const first = await invoke<number>("create_manual_project", {name: "Client alpha"});
        const second = await invoke<number>("create_manual_project", {name: "Client beta"});
        const start = Math.floor(Date.now() / 1000) - 86400;
        const args = {weekStart: start, weekEnd: start + 3600};
        type Stats = {total_time: number; categories: Array<{category: string; total_duration: number}>};
        const before = await invoke<Stats>("get_week_statistics", args);
        const ids: number[] = [];
        for (const [project_id, duration] of [[first, 600], [second, 900], [null, 300]]) ids.push(await invoke<number>("insert_manual_time_block", {newManualTimeBlock: {title: "", project_id, start_time: start, end_time: start + duration!}}));
        const stats = await invoke<Stats>("get_week_statistics", args);
        expect(stats.total_time - before.total_time).toBe(1800);
        expect(stats.categories).toContainEqual(expect.objectContaining({category: "Client alpha", total_duration: 600}));
        expect(stats.categories).toContainEqual(expect.objectContaining({category: "Client beta", total_duration: 900}));
        expect(stats.categories.find((row) => row.category === "Manual time")!.total_duration - (before.categories.find((row) => row.category === "Manual time")?.total_duration ?? 0)).toBe(300);
        await invoke("update_manual_project", {id: first, name: "Renamed alpha"});
        const renamed = await invoke<Stats>("get_week_statistics", args);
        expect(renamed.categories).toContainEqual(expect.objectContaining({category: "Renamed alpha", total_duration: 600}));
        expect(renamed.categories.some((row) => row.category === "Client alpha")).toBe(false);
        await invoke("delete_manual_project", {id: first});
        const deleted = await invoke<Stats>("get_week_statistics", args);
        expect(deleted.total_time).toBe(stats.total_time);
        expect(deleted.categories.find((row) => row.category === "Manual time")!.total_duration - (before.categories.find((row) => row.category === "Manual time")?.total_duration ?? 0)).toBe(900);
        for (const id of ids) await invoke("delete_manual_time_block", {id});
        await invoke("delete_manual_project", {id: second});
    });
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


describe("compact demo statistics commands", () => {
    it("returns only the lifetime bounds fields used to bootstrap Detailed Statistics", async () => {
        const full = await invoke<{first_active_day: number | null; total_time_all_time: number}>("get_total_statistics");
        expect(await invoke("get_statistics_bounds")).toEqual({first_active_day: full.first_active_day, total_time_all_time: full.total_time_all_time});
    });
    it("preserves ordered weekly chart values and manual/device scope", async () => {
        const weeks = [{week_start: 0, week_end: 1}, {week_start: 0, week_end: Math.floor(Date.now() / 1000) + 86400}];
        const batch = await invoke("get_trend_statistics", {weeks, includeManual: false, deviceUuids: null});
        const expected = await Promise.all(weeks.map(async ({week_start, week_end}) => {
            const stats = await invoke<{total_time: number; categories: unknown[]; all_apps: unknown[]}>("get_week_statistics", {weekStart: week_start, weekEnd: week_end, includeManual: false, deviceUuids: null});
            return {total_time: stats.total_time, categories: stats.categories, all_apps: stats.all_apps};
        }));
        expect(batch).toEqual(expected);
    });
});
