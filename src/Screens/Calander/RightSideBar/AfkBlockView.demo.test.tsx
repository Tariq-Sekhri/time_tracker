/* @vitest-environment jsdom */
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
vi.mock("@tauri-apps/api/core",()=>import("../../../../demo/mock/core"));
import {invoke} from "../../../../demo/mock/core";
import AfkBlockView from "./AfkBlockView";
import {type AfkInterval} from "../../../afk/model";
import {type AfkBlockDetails} from "../../../afk/details";
afterEach(cleanup);
it("shows simulated saved sources, confidence, and expandable same-device away logs",async()=>{
    const evidence=await invoke<AfkInterval[]>("get_afk_intervals",{rangeStart:0,rangeEnd:Number.MAX_SAFE_INTEGER});
    const first=evidence[0];
    const details=await invoke<AfkBlockDetails>("get_afk_block_details",{deviceUuid:first.device_uuid,rangeStart:first.start_time,rangeEnd:first.start_time+600});
    expect(details.evidence.length).toBe(3);
    expect(details.logs.length).toBeGreaterThan(0);
    expect(details.logs.every(log=>log.device_uuid===first.device_uuid&&details.evidence.some(e=>log.timestamp>=e.start_time&&log.timestamp+log.duration<=e.end_time))).toBe(true);
    const filtered=await invoke<AfkBlockDetails["logs"]>("query_afk",{command:"get_logs",args:{}});
    expect(filtered.some(log=>log.device_uuid===first.device_uuid&&details.evidence.some(e=>log.timestamp<e.end_time&&log.timestamp+log.duration>e.start_time))).toBe(false);
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    render(<QueryClientProvider client={client}><AfkBlockView event={{title:"AFK",start:new Date(first.start_time*1000),end:new Date((first.start_time+600)*1000),apps:[],afkDeviceUuid:first.device_uuid,afkDeviceName:"Demo desktop"}} onClose={()=>{}}/></QueryClientProvider>);
    expect(await screen.findByText("Confidence score")).toBeTruthy();
    expect(screen.getByText("Windows input timer")).toBeTruthy();
    expect(screen.getByText("Locked desktop")).toBeTruthy();
    expect(screen.getByText("Any media playback")).toBeTruthy();
    expect(screen.getByRole("heading",{name:/Logs captured while away/})).toBeTruthy();
    expect(document.querySelectorAll("section details").length).toBeGreaterThan(0);
    client.clear();
});
