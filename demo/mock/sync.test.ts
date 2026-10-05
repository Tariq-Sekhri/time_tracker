import {describe, expect, it, vi} from "vitest";
import {invoke, DEMO_SERVER_IP} from "./core";
import {listen} from "./event";
import type {Device} from "../../src/api/sync";

describe("simulated sync", () => {
    it("seeds subscribed laptop and phone, downloads tablet logs, removes them and restores them without duplicates", async () => {
        const devices = await invoke<Device[]>("get_devices");
        expect(devices.find((row) => row.uuid === "demo-desktop")?.state).toHaveProperty("Local");
        for (const uuid of ["demo-laptop", "demo-phone"]) {
            expect(devices.find((row) => row.uuid === uuid)).toMatchObject({state: {Remote: {is_tracking: true}}, has_local_logs: true});
        }
        expect(devices.find((row) => row.uuid === "demo-tablet")).toMatchObject({state: {Remote: {is_tracking: false}}, has_local_logs: false});
        const args = {weekStart: Math.floor(Date.now() / 1000) - 14 * 86400, weekEnd: Math.floor(Date.now() / 1000), deviceUuids: ["demo-tablet"], includeManual: false};
        expect(await invoke("get_week", args)).toEqual([]);
        await invoke("set_is_tracking", {uuid: "demo-tablet", new: true});
        expect(await invoke<number>("device_logs", {deviceUuid: "demo-tablet"})).toBeGreaterThan(0);
        const downloaded = await invoke("get_week", args);
        expect(downloaded).not.toEqual([]);
        expect(await invoke("device_logs", {deviceUuid: "demo-tablet"})).toBe(0);
        const stats = await invoke<{total_time: number}>("get_week_statistics", args);
        expect(stats.total_time).toBeGreaterThan(0);
        const downloadedLogs = await invoke<Array<{id: number; device_uuid?: string}>>("get_logs");
        const removedId = downloadedLogs.find((row) => row.device_uuid === "demo-tablet")!.id;
        await invoke("delete_log_by_id", {id: removedId});
        await invoke("sync_now");
        expect((await invoke<Array<{id: number}>>("get_logs")).some((row) => row.id === removedId)).toBe(false);
        await invoke("update_device", {update: {uuid: "demo-tablet", in_cal: false, in_stats: false}});
        expect((await invoke<Device[]>("get_devices")).find((row) => row.uuid === "demo-tablet")).toMatchObject({in_cal: false, in_stats: false});
        const snapshot = devices.find((row) => row.uuid === "demo-tablet")!;
        expect(snapshot.state).toEqual({Remote: {is_tracking: false}});
        await invoke("unsubscribe_device", {uuid: "demo-tablet"});
        expect(await invoke("get_week", args)).toEqual([]);
        expect((await invoke<{total_time: number}>("get_week_statistics", args)).total_time).toBe(0);
        await invoke("set_is_tracking", {uuid: "demo-tablet", new: true});
        await invoke("device_logs", {deviceUuid: "demo-tablet"});
        expect(await invoke("get_week", args)).toEqual(downloaded);
        await invoke("unsubscribe_device", {uuid: "demo-tablet"});
    });

    it("keeps the fake server fixed and emits a simulated sync cycle without network calls", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network must not be used"));
        const events: string[] = [];
        const stops = await Promise.all(["sync_started", "sync-successful", "count_down_to_sync"].map((event) => listen(event, () => events.push(event))));
        try {
            await expect(invoke("get_server_ip")).resolves.toBe(DEMO_SERVER_IP);
            for (const ip of ["https://attacker.invalid", "127.0.0.1:3033", "https://demo-sync.invalid"]) {
                await expect(invoke("check", {ip})).rejects.toThrow("fixed");
                await expect(invoke("set_server_ip", {serverIp: ip})).rejects.toThrow("fixed");
            }
            await expect(invoke("get_server_ip")).resolves.toBe(DEMO_SERVER_IP);
            await invoke("sync_now");
            expect(events).toEqual(["sync_started", "sync-successful", "count_down_to_sync"]);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            stops.forEach((stop) => stop());
            fetchSpy.mockRestore();
        }
    });
});
