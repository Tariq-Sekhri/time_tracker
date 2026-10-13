/* @vitest-environment jsdom */
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
vi.mock("@tauri-apps/api/core",()=>import("../../demo/mock/core"));
import {invoke} from "../../demo/mock/core";
import AfkSettings from "./AfkSettings";
import {ToastProvider} from "./Toast";
import {defaultAfkSettings,type AfkSettings as Config} from "../afk/model";
afterEach(cleanup);
it("allows numeric edits, preview, and saving source rules without changing logs",async()=>{
    await invoke("set_afk_settings",{settings:defaultAfkSettings()});
    const before=await invoke("get_logs");
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}}),user=userEvent.setup();
    render(<QueryClientProvider client={client}><ToastProvider><AfkSettings/></ToastProvider></QueryClientProvider>);
    await user.click(await screen.findByRole("tab",{name:"Sources"}));
    await user.click(screen.getByRole("button",{name:/Playback/}));
    await screen.findByRole("spinbutton",{name:"Any media playback weight"});
    for(const name of ["Any media playback","Foreground playback app","Audio output","Video playback"]) {
        const input=screen.getByRole("spinbutton",{name:`${name} weight`});
        await user.clear(input);await user.type(input,"0");await user.tab();
    }
    expect(screen.getByText(/Draft preview: AFK/)).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"Save AFK settings"}));
    await waitFor(async()=>expect((await invoke<Config>("get_afk_settings")).sources[10].weight).toBe(0));
    expect(await invoke("get_logs")).toEqual(before);
    await invoke("set_afk_settings",{settings:defaultAfkSettings()});client.clear();
});
it("filters demo statistics using snapshots and preserves all records",async()=>{
    const before=await invoke("get_logs");
    const all=await invoke<{total_time:number}>("get_total_statistics",{includeManual:false});
    const filtered=await invoke<{total_time:number}>("query_afk",{command:"get_total_statistics",args:{includeManual:false}});
    expect(filtered.total_time).toBeLessThan(all.total_time);
    expect(await invoke("get_logs")).toEqual(before);
});
