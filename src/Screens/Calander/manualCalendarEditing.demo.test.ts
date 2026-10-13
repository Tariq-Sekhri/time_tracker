import {expect, it, vi} from "vitest";
vi.mock("@tauri-apps/api/core", () => import("../../../demo/mock/core"));
import {invoke} from "../../../demo/mock/core";
import {persistManualEventRange} from "./manualCalendarEditing.ts";
it("persists a move and resize in the future without losing the entry details", async () => {
    const start = Math.floor(Date.now()/1000)+86400000;
    const projectId = await invoke<number>("create_manual_project", {name:"Drag project"});
    const id = await invoke<number>("insert_manual_time_block", {newManualTimeBlock:{title:"Scheduled", notes:"Retain notes", project_id:projectId, start_time:start, end_time:start+3600}});
    const event = {start:new Date((start+86400)*1000), end:new Date((start+86400+7200)*1000), extendedProps:{manualTimeBlockId:id, manualTitle:"Scheduled", notes:"Retain notes", projectId}};
    await persistManualEventRange(event);
    const blocks = await invoke<unknown[]>("get_manual_time_blocks", {rangeStart:start+86400, rangeEnd:start+86400+7201});
    expect(blocks).toContainEqual(expect.objectContaining({id,title:"Scheduled",notes:"Retain notes",project_id:projectId,start_time:start+86400,end_time:start+86400+7200}));
    await expect(persistManualEventRange({...event,end:event.start})).rejects.toThrow("valid manual time range");
    await invoke("delete_manual_time_block",{id});
    await invoke("delete_manual_project",{id:projectId});
});
