/* @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, expect, it, vi} from "vitest";

const bridge = vi.hoisted(() => ({commands: [] as string[]}));
vi.mock("@tauri-apps/api/core", async () => {
    const demo = await import("../../demo/mock/core");
    return {invoke: (command: string, args?: Record<string, unknown>) => {
        bridge.commands.push(command);
        // Prevent the old missing-command loop from hanging the regression test.
        if (command === "get_database_location") return new Promise(() => {});
        return demo.invoke(command, args);
    }};
});
import Settings from "./Settings";
import {ToastProvider} from "../Componants/Toast";
import {invoke} from "../../demo/mock/core";
afterEach(() => {cleanup(); Reflect.deleteProperty(window, "__TAURI_INTERNALS__");});

it("browser Settings loads without native-only requests and supports Notes and numeric settings", async () => {
    bridge.commands.length = 0;
    await invoke("set_notes_enabled", {enabled: false});
    const user = userEvent.setup();
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><ToastProvider><Settings /></ToastProvider></QueryClientProvider>);
    const row = screen.getByText("Start hour").closest("div")!;
    const input = within(row).getByRole("spinbutton") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("6"));
    expect(bridge.commands).not.toContain("get_database_location");
    expect(bridge.commands).not.toContain("get_support_log_info");
    expect(screen.queryByText("Database file")).toBeNull();
    expect(screen.queryByText("Right sidebar width (px)")).toBeNull();
    expect(screen.queryByRole("button", {name: "Open log folder"})).toBeNull();
    expect(screen.queryByText("Failed to load database location")).toBeNull();

    await user.click(screen.getByRole("checkbox", {name: "Enable dev mode"}));
    await waitFor(async () => expect(await invoke("get_notes_state")).toMatchObject({enabled: true}));

    await user.clear(input);
    await user.type(input, "7");
    await user.tab();
    await waitFor(async () => expect(await invoke<Array<{key: string; val: number}>>("get_settings")).toContainEqual(expect.objectContaining({key: "calendarStartHour", val: 7})));
    await user.click(within(row).getByRole("button", {name: "Lock"}));
    await waitFor(() => expect(input.disabled).toBe(true));
    await user.click(within(row).getByRole("button", {name: "Unlock"}));
    await waitFor(() => expect(input.disabled).toBe(false));
    await user.click(within(row).getByRole("button", {name: "Reset to default"}));
    await waitFor(() => expect(input.value).toBe("6"));
    expect(screen.queryByText("Failed to load database location")).toBeNull();
});

it("keeps unsaved tracking changes when navigating settings sections", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><ToastProvider><Settings /></ToastProvider></QueryClientProvider>);
    expect(screen.getByRole("tabpanel", {name: "General"})).toBeTruthy();
    await user.click(screen.getByRole("tab", {name: "Tracking"}));
    const threshold = await screen.findByRole("spinbutton", {name: "Away score threshold (%)"});
    fireEvent.change(threshold, {target: {value: "83"}});
    await user.click(screen.getByRole("tab", {name: "General"}));
    expect(screen.queryByRole("spinbutton", {name: "Away score threshold (%)"})).toBeNull();
    expect(screen.getByRole("button", {name: "Customize colors"})).toBeTruthy();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", {name: "Tracking"}).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByRole("spinbutton", {name: "Away score threshold (%)"}) as HTMLInputElement).value).toBe("83");
    expect(screen.queryByRole("tab", {name: "Data & support"})).toBeNull();
});

it("opens import/export from desktop Settings only in dev mode while keeping the other sections available", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {configurable: true, value: {}});
    bridge.commands.length = 0;
    await invoke("set_notes_enabled", {enabled: false});
    const user = userEvent.setup();
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><ToastProvider><Settings /></ToastProvider></QueryClientProvider>);
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["General", "Tracking", "Data & support"]);
    await user.click(screen.getByRole("checkbox", {name: "Enable dev mode"}));
    await screen.findByRole("tab", {name: "Import & export"});
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["General", "Tracking", "Import & export", "Data & support"]);
    expect(bridge.commands).not.toContain("get_export_filter_options");
    fireEvent.click(screen.getByRole("tab", {name: "Import & export"}));
    expect(screen.getByRole("tabpanel", {name: "Import & export"})).toBeTruthy();
    await screen.findByRole("tab", {name: "Export"});
    await waitFor(() => expect(bridge.commands).toContain("get_export_filter_options"));
    fireEvent.click(screen.getByRole("tab", {name: "Data & support"}));
    expect(screen.getByRole("tabpanel", {name: "Data & support"})).toBeTruthy();
    expect(bridge.commands).not.toContain("export_dataset");
    expect(bridge.commands).not.toContain("import_dataset");
});
