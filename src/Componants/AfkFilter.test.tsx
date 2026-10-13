/* @vitest-environment jsdom */
import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import AfkFilter from "./AfkFilter";
import {useAfkFilter} from "../stores/afkFilterStore";

afterEach(()=>{cleanup();useAfkFilter.getState().setExcludeAfk(true);});
it("starts unchecked and includes AFK only when enabled",async()=>{
    useAfkFilter.getState().setExcludeAfk(true);
    const client=new QueryClient();
    render(<QueryClientProvider client={client}><AfkFilter/></QueryClientProvider>);
    const checkbox=screen.getByRole("checkbox",{name:"Include AFK"}) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await userEvent.click(checkbox);
    await waitFor(()=>expect(useAfkFilter.getState().excludeAfk).toBe(false));
    expect(checkbox.checked).toBe(true);
    await userEvent.click(checkbox);
    await waitFor(()=>expect(useAfkFilter.getState().excludeAfk).toBe(true));
    expect(checkbox.checked).toBe(false);
    client.clear();
});
