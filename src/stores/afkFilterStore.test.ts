/* @vitest-environment jsdom */
import {afterEach,expect,it,vi} from "vitest";

afterEach(()=>{localStorage.removeItem("time-tracker:afk-filter");vi.resetModules();});

it("hides AFK by default and enables it for existing opt-in installations",async()=>{
    localStorage.setItem("time-tracker:afk-filter",JSON.stringify({state:{excludeAfk:false},version:0}));
    const {useAfkFilter}=await import("./afkFilterStore");
    await useAfkFilter.persist.rehydrate();
    expect(useAfkFilter.getState().excludeAfk).toBe(true);
});

it("preserves an explicit choice to inspect raw history after upgrading",async()=>{
    localStorage.setItem("time-tracker:afk-filter",JSON.stringify({state:{excludeAfk:false},version:2}));
    const {useAfkFilter}=await import("./afkFilterStore");
    await useAfkFilter.persist.rehydrate();
    expect(useAfkFilter.getState().excludeAfk).toBe(false);
});

it("starts the renamed Include AFK control off on upgrade",async()=>{
    localStorage.setItem("time-tracker:afk-filter",JSON.stringify({state:{excludeAfk:false},version:1}));
    const {useAfkFilter}=await import("./afkFilterStore");
    await useAfkFilter.persist.rehydrate();
    expect(useAfkFilter.getState().excludeAfk).toBe(true);
});
