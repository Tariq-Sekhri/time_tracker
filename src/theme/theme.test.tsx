/* @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, expect, it} from "vitest";
import {COLOR_FIELDS, contrastRatio, normalizeColor, parseTheme, PRESETS, STORAGE_KEY, THEME_FAMILIES, withBrightness} from "./model";
import {activeTheme, initializeTheme, useThemeStore} from "./store";
import ThemeSettings from "./ThemeSettings";

beforeEach(()=>{localStorage.clear();useThemeStore.setState({activeId:"dark",customThemes:[],storageError:false});});
afterEach(cleanup);
it("blends every palette from stable endpoints and keeps readable text",()=>{
    for(const family of THEME_FAMILIES){
        const dark=PRESETS.find(p=>p.id===family.dark)!;
        const light=PRESETS.find(p=>p.id===family.light)!;
        expect(withBrightness(dark,100).colors).toEqual(dark.colors);
        const ultra=withBrightness(dark,10);
        for(const key of ["app","panel","sidebar","calendar","raised"] as const) expect(ultra.colors[key]).toBe("#000000");
        expect(withBrightness(light,100).colors).toEqual(light.colors);
        const middle=withBrightness(dark,50);
        expect(withBrightness(middle,100).colors).toEqual(dark.colors);
        for(const value of [20,40,60,80,100]) expect(contrastRatio(withBrightness(dark,value).colors.text,withBrightness(dark,value).colors.panel)!).toBeGreaterThan(4.5);
    }
});
it("saves slider position and carries brightness between color palettes",()=>{
    const store=useThemeStore.getState();store.select("dusk");store.setBrightness(73);
    const theme=activeTheme(useThemeStore.getState());
    expect(theme.brightness).toBe(73);
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parseTheme(saved.customThemes[0])).toEqual(theme);
    store.setBrightness(10);expect(useThemeStore.getState().customThemes).toHaveLength(1);
    store.selectFamily("ocean");expect(activeTheme(useThemeStore.getState()).brightness).toBe(10);
    expect(activeTheme(useThemeStore.getState()).baseId).toBe("ocean");
});
it("keeps brightness within its mode and preserves mode when selecting palettes",()=>{
    const store=useThemeStore.getState();store.select("dusk");store.setBrightness(24);
    store.setMode("light");
    expect(activeTheme(useThemeStore.getState()).mode).toBe("light");
    expect(activeTheme(useThemeStore.getState()).brightness).toBe(24);
    store.selectFamily("ocean");
    expect(activeTheme(useThemeStore.getState()).mode).toBe("light");
    store.setBrightness(0);expect(activeTheme(useThemeStore.getState()).mode).toBe("light");
    store.setMode("dark");store.setBrightness(100);
    expect(activeTheme(useThemeStore.getState()).mode).toBe("dark");
    expect(activeTheme(useThemeStore.getState()).colors).toEqual(PRESETS.find(p=>p.id==="ocean")!.colors);
});
it("keeps preset colors immutable and persists named custom themes with alpha",()=>{
    const store=useThemeStore.getState();store.select("light");store.edit("app","#12345680");store.rename("My theme");
    const theme=activeTheme(useThemeStore.getState());expect(theme.name).toBe("My theme");expect(theme.colors.app).toBe("#12345680");
    expect(PRESETS.find(p=>p.id==="light")!.colors.app).toBe("#dce2eb");
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)!);expect(saved.customThemes[0].colors.app).toBe("#12345680");
    expect(parseTheme(saved.customThemes[0])).toEqual(theme);
    store.select("dark");expect(document.documentElement.style.getPropertyValue("--tt-app")).toBe("#000000");
    expect(useThemeStore.getState().customThemes).toHaveLength(1);
});
it("validates imports, rejects CSS values and keeps existing themes",()=>{
    const store=useThemeStore.getState();store.customize();const existing=useThemeStore.getState().activeId;
    expect(()=>store.importTheme(JSON.stringify({name:"Bad",mode:"dark",colors:{app:"url(https://example.com)"}}))).toThrow("Invalid color");
    expect(()=>store.importTheme(JSON.stringify({name:"Bad",mode:"dark",colors:{unknown:"#fff"}}))).toThrow("Unknown color");
    expect(useThemeStore.getState().activeId).toBe(existing);
    store.importTheme(JSON.stringify({name:"Imported",mode:"light",baseId:"light",colors:{accent:"#abc"}}));
    expect(activeTheme(useThemeStore.getState()).colors.accent).toBe("#aabbcc");
    expect(useThemeStore.getState().customThemes).toHaveLength(2);
    expect(normalizeColor("#abcd")).toBe("#aabbccdd");
});
it("restores readable dark without deleting custom themes using the emergency shortcut",()=>{
    const stop=initializeTheme();useThemeStore.getState().edit("text","#000000");
    window.dispatchEvent(new KeyboardEvent("keydown",{ctrlKey:true,altKey:true,shiftKey:true,code:"KeyT"}));
    expect(useThemeStore.getState().activeId).toBe("dark");expect(useThemeStore.getState().customThemes).toHaveLength(1);stop();
});
it("allows full hex entry without expanding partial values, searches all groups, and resets one color",async()=>{
    const user=userEvent.setup();render(<ThemeSettings/>);
    await user.click(screen.getByRole("button",{name:"Customize colors"}));
    const input=screen.getByLabelText("App background");await user.clear(input);await user.type(input,"#abcdef80");
    expect((input as HTMLInputElement).value).toBe("#abcdef80");
    await user.tab();expect(activeTheme(useThemeStore.getState()).colors.app).toBe("#abcdef80");
    await user.click(screen.getByRole("button",{name:"Reset App background"}));expect(activeTheme(useThemeStore.getState()).colors.app).toBe("#000000");
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"Current time indicator"}});
    expect(screen.getByLabelText("Current time indicator")).toBeTruthy();expect(screen.queryByLabelText("App background")).toBeNull();
    expect(COLOR_FIELDS.length).toBeGreaterThan(60);
});
it("applies every calendar and chart token independently",()=>{
    act(()=>{const store=useThemeStore.getState();store.edit("calendar","#fffafa");store.edit("chartTotal","#123456");store.edit("onAccent","#121212");});
    const style=document.documentElement.style;
    expect(style.getPropertyValue("--tt-calendar")).toBe("#fffafa");expect(style.getPropertyValue("--tt-chartTotal")).toBe("#123456");expect(style.getPropertyValue("--tt-onAccent")).toBe("#121212");
});

it("keeps additional context overrides off for the original theme and clears them when restored",()=>{
    const store=useThemeStore.getState();store.select("dark");
    expect(document.documentElement.dataset.themeColorOverrides).toBe("");
    expect(document.documentElement.style.getPropertyValue("--tt-accent")).toBe("#3b82f6");
    store.edit("sidebarControls","#351535");
    expect(document.documentElement.dataset.themeColorOverrides).toContain("sidebarControls");
    store.select("dark");
    expect(document.documentElement.dataset.themeColorOverrides).toBe("");
});

it("keeps inactive sources readable on the black surfaces independently of faint borders",()=>{
    for(const id of ["oled","obsidian","deep-forest","black-cherry"]){
        const theme=PRESETS.find(p=>p.id===id)!;
        expect(contrastRatio(theme.colors.disabledText,theme.colors.sidebar)).toBeGreaterThanOrEqual(4.5);
        expect(theme.colors.sidebarSelection).toBe("#00000000");
        expect(theme.colors.sidebarControls).toBe("#00000000");
        useThemeStore.getState().select(id);
        expect(document.documentElement.dataset.themeColorOverrides).toContain("disabledText");
    }
});
