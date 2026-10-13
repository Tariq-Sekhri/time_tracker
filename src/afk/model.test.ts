import {describe,expect,it} from "vitest";
import {defaultAfkSettings,evaluateAfk,AFK_SOURCES,type Observation} from "./model";
import {afkSpans,subtractAfk} from "./intervals";
const idle=()=>AFK_SOURCES.map((_,i):Observation=>({available:i===0,active:false,idle_seconds:i===0?600:null,detail:"test"}));
describe("AFK decisions",()=>{
    it("lets media and video weights protect passive watching independently",()=>{
        const s=defaultAfkSettings(),o=idle();
        expect(evaluateAfk(s,o).state).toBe("afk");
        o[4]={available:true,active:true,idle_seconds:null,detail:"background music"};
        expect(evaluateAfk(s,o).state).toBe("present");
        s.sources[4].weight=10;expect(evaluateAfk(s,o).state).toBe("afk");
        o[10]={available:true,active:true,idle_seconds:null,detail:"video"};
        expect(evaluateAfk(s,o).state).toBe("present");
    });
    it("does not count unavailable sources or inflate correlated input votes",()=>{
        const s=defaultAfkSettings(),o=idle();s.minimum_sources=2;
        for(const i of [1,2]) {o[i]={...o[0]};s.sources[i].absence_is_away=true;}
        expect(evaluateAfk(s,o)).toMatchObject({state:"unknown",agreeing_sources:1});
        s.group_related_sources=false;expect(evaluateAfk(s,o)).toMatchObject({state:"afk",agreeing_sources:3});
        o.forEach(x=>x.available=false);expect(evaluateAfk(s,o).state).toBe("unknown");
    });
    it("supports a configurable lock override and input inactivity",()=>{
        const s=defaultAfkSettings(),o=idle();o[4]={available:true,active:true,idle_seconds:null,detail:"media"};
        o[8]={available:true,active:true,idle_seconds:null,detail:"locked"};
        expect(evaluateAfk(s,o).state).toBe("afk");s.locked_is_away=false;s.away_threshold=90;
        expect(evaluateAfk(s,o).state).toBe("present");
        s.sources[0].timeout_seconds=700;expect(evaluateAfk(s,o).active_mask&1).toBe(1);
    });
});
it("subtracts only matching AFK spans and preserves original data",()=>{
    const logs=[{id:1,device_uuid:"a",timestamp:100,duration:100},{id:2,device_uuid:"b",timestamp:100,duration:100}];
    const evidence=[{device_uuid:"a",start_time:120,end_time:160,state:2,known_mask:1,active_mask:0,settings_id:1},
        {device_uuid:"a",start_time:150,end_time:180,state:2,known_mask:1,active_mask:0,settings_id:2}];
    expect(afkSpans(evidence,100,200)).toEqual([{device:"a",start:120,end:180}]);
    expect(subtractAfk(logs,evidence).reduce((sum,l)=>sum+l.duration,0)).toBe(140);
    expect(logs[0].duration).toBe(100);
    expect(subtractAfk(logs,evidence.map(i=>({...i,state:0})))).toEqual(logs);
});
