/* @vitest-environment jsdom */
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, expect, it, vi} from "vitest";
vi.mock("@tauri-apps/api/core", () => import("../../demo/mock/core"));
import {invoke} from "../../demo/mock/core";
import {getManualCategories} from "../api/ManualProject";
import {get_manual_time_blocks, manualTimeCategoryStats} from "../api/ManualTimeBlock";
import SourceEditor from "./SourceEditor";
import {get_categories, update_category_by_id} from "../api/Category";
import {delete_google_calendar, get_google_calendar_by_id, insert_google_calendar} from "../api/GoogleCalendar";

afterEach(cleanup);

it("locks Uncategorized's name while allowing its color to change for recorded time", async () => {
    const user = userEvent.setup();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const close = vi.fn();
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const start = Math.floor(Date.now() / 1000) - 600;
    const blockId = await invoke<number>("insert_manual_time_block", {newManualTimeBlock: {title: "Keep this", notes: "Keep notes", start_time: start, end_time: start + 300}});
    try {
        const category = (await getManualCategories()).find((category) => category.id === null)!;
        render(<QueryClientProvider client={client}><SourceEditor source={{kind: "manual", value: category}} anchor={anchor} onClose={close} /></QueryClientProvider>);
        expect((screen.getByRole("textbox", {name: "Name"}) as HTMLInputElement).disabled).toBe(true);
        await expect(invoke("update_manual_category", {id: null, name: "Personal time", color: "#34d399"})).rejects.toThrow("Uncategorized cannot be renamed");
        await user.click(screen.getByRole("button", {name: "Use #fb7185"}));
        await user.click(screen.getByRole("button", {name: "Save"}));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        const blocks = await get_manual_time_blocks(start, start + 300);
        expect(blocks.find((block) => block.id === blockId)).toMatchObject({project_id: null, project_name: "Uncategorized", project_color: "#fb7185", notes: "Keep notes"});
        expect(manualTimeCategoryStats(blocks, start, start + 300)).toContainEqual({category: "Uncategorized", color: "#fb7185", total_duration: 300});
    } finally {
        await invoke("delete_manual_time_block", {id: blockId});
        await invoke("delete_app_metadata", {key: "manual_category_name:none"});
        await invoke("delete_app_metadata", {key: "manual_category_color:none"});
        anchor.remove();
    }
});

it("edits tracked category priority while preserving its latest visibility settings", async () => {
    const user = userEvent.setup();
    const category = {...(await get_categories()).find((category) => category.name === "Coding")!};
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const close = vi.fn();
    try {
        render(<QueryClientProvider client={new QueryClient()}><SourceEditor source={{kind: "category", value: category}} anchor={anchor} onClose={close} /></QueryClientProvider>);
        await update_category_by_id({...category, is_visible: false, in_stats: false});
        await user.clear(screen.getByRole("textbox", {name: "Name"}));
        await user.type(screen.getByRole("textbox", {name: "Name"}), "Deep work");
        await user.clear(screen.getByRole("spinbutton", {name: "Priority"}));
        await user.type(screen.getByRole("spinbutton", {name: "Priority"}), "850");
        await user.click(screen.getByRole("button", {name: "Use #34d399"}));
        await user.click(screen.getByRole("button", {name: "Save"}));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect((await get_categories()).find((row) => row.id === category.id)).toMatchObject({name: "Deep work", color: "#34d399", priority: 850, is_visible: false, in_stats: false});
    } finally {await update_category_by_id(category); anchor.remove();}
});

it("edits a Google calendar locally without changing its inclusion settings", async () => {
    const user = userEvent.setup();
    const id = await insert_google_calendar({google_calendar_id: "source-editor-test", account_email: "demo@example.test", name: "Test calendar", color: "#0ea5e9", is_visible: false, in_stats: true});
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const close = vi.fn();
    try {
        const calendar = await get_google_calendar_by_id(id);
        render(<QueryClientProvider client={new QueryClient()}><SourceEditor source={{kind: "google", value: calendar}} anchor={anchor} onClose={close} /></QueryClientProvider>);
        expect(screen.queryByRole("spinbutton", {name: "Priority"})).toBeNull();
        await user.clear(screen.getByRole("textbox", {name: "Name"}));
        await user.type(screen.getByRole("textbox", {name: "Name"}), "Appointments");
        await user.click(screen.getByRole("button", {name: "Use #a78bfa"}));
        await user.click(screen.getByRole("button", {name: "Save"}));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(await get_google_calendar_by_id(id)).toMatchObject({name: "Appointments", color: "#a78bfa", is_visible: false, in_stats: true});
    } finally {await delete_google_calendar(id); anchor.remove();}
});
