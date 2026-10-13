/* @vitest-environment jsdom */
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
vi.mock("@tauri-apps/api/core",()=>import("../../../demo/mock/core"));
import {invoke} from "../../../demo/mock/core";
import {type AfkInterval} from "../../afk/model";
import {type AfkBlockDetails} from "../../afk/details";
import AfkEventContent from "./AfkEventContent";
afterEach(cleanup);
it("renders captured logs as nested content of the AFK event, with expandable fragments",async()=>{
    const evidence=await invoke<AfkInterval[]>("get_afk_intervals",{rangeStart:0,rangeEnd:Number.MAX_SAFE_INTEGER});
    const first=evidence[0],end=first.start_time+600;
    const data=await invoke<AfkBlockDetails>("get_afk_block_details",{deviceUuid:first.device_uuid,rangeStart:first.start_time,rangeEnd:end});
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}}),onEventClick=vi.fn();
    const view=render(<QueryClientProvider client={client}><div className="fc-event tt-afk-evidence" onClick={onEventClick}><AfkEventContent device={first.device_uuid} start={first.start_time} end={end} timeText="9:00–9:10"/></div></QueryClientProvider>);
    const content=screen.getByLabelText("Captured logs inside AFK block");
    expect(content.closest(".fc-event.tt-afk-evidence")).toBeTruthy();
    expect(await within(content).findByText(data.logs[0].app)).toBeTruthy();
    const summary=content.querySelector("summary")!;
    fireEvent.click(summary);
    expect(onEventClick).not.toHaveBeenCalled();
    expect(content.querySelectorAll("li").length).toBeGreaterThan(0);
    view.unmount();
    expect(screen.queryByLabelText("Captured logs inside AFK block")).toBeNull();
    client.clear();
});
