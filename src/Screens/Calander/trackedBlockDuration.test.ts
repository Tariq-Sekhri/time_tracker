import {expect,it} from "vitest";
import {trackedBlockDuration} from "./utils";
it("does not label a merged overnight range as tracked AFK time",()=>{
    expect(trackedBlockDuration({startTime:0,endTime:41700,apps:[{totalDuration:505}]})).toBe(505);
    expect(trackedBlockDuration({startTime:0,endTime:3600,apps:[{totalDuration:3600},{totalDuration:3600}]})).toBe(3600);
});
