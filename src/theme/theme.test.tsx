/* @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, expect, it} from "vitest";
import {COLOR_FIELDS, normalizeColor, parseTheme, PRESETS, STORAGE_KEY} from "./model";
import {activeTheme, initializeTheme, useThemeStore} from "./store";
import ThemeSettings from "./ThemeSettings";

beforeEach(()=>{localStorage.clear();useThemeStore.setState({activeId:"dark",customThemes:[],storageError:false});});
afterEach(cleanup);
it("keeps preset colors immutable and persists named custom themes with alpha",()=>{
    const store=useThemeStore.getState();store.select("light");store.edit("app","#12345680");store.rename("My theme");
    const theme=activeTheme(useThemeStore.getState());expect(theme.name).toBe("My theme");expect(theme.colors.app).toBe("#12345680");
    expect(PRESETS.find(p=>p.id==="light")!.colors.app).toBe("#f4f5f7");
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
