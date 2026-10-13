import {expect,it} from "vitest";
import {defaultAfkSettings} from "./model";
import {summarizeAfkEvidence} from "./details";
it("uses recorded configurations and weights confidence by recorded duration",()=>{
    const idle=defaultAfkSettings();
    const playback=defaultAfkSettings();playback.sources[4].weight=10;
    const result=summarizeAfkEvidence([
        {start_time:100,end_time:110,known_mask:1,active_mask:0,settings:idle},
        {start_time:120,end_time:150,known_mask:17,active_mask:16,settings:playback},
    ]);
    expect(result.seconds).toBe(40);
    expect(result.confidence).toBe(89);
    expect(result.sources.find(s=>s.id==="media")).toMatchObject({known:30,active:30});
    expect(summarizeAfkEvidence([]).confidence).toBeNull();
});
