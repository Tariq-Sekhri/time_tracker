/* @vitest-environment jsdom */
import {expect,it,vi} from "vitest";
vi.mock("../diagnostics",()=>({invokeLogged:vi.fn().mockResolvedValue([])}));
import {invokeLogged} from "../diagnostics";
import {invokeOrThrow} from "../utils";
import {useAfkFilter} from "../stores/afkFilterStore";
it("keeps ordinary activity filtered when AFK blocks are included and loads details separately",async()=>{
    useAfkFilter.getState().setExcludeAfk(false);
    await invokeOrThrow("get_week",{weekAnchor:100});
    expect(invokeLogged).toHaveBeenLastCalledWith("query_afk",{command:"get_week",args:{weekAnchor:100}});
    await invokeOrThrow("get_afk_block_details",{deviceUuid:"a",rangeStart:100,rangeEnd:200});
    expect(invokeLogged).toHaveBeenLastCalledWith("get_afk_block_details",{deviceUuid:"a",rangeStart:100,rangeEnd:200});
    useAfkFilter.getState().setExcludeAfk(true);
});
