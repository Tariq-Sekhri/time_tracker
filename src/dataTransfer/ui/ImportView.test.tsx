/* @vitest-environment jsdom */
import {cleanup, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {ImportReport, ImportRequest} from "../../api/dataTransfer.ts";

const bridge = vi.hoisted(() => ({open: vi.fn(), read: vi.fn(), importData: vi.fn()}));
vi.mock("@tauri-apps/plugin-dialog", () => ({open: bridge.open}));
vi.mock("../../api/dataTransfer.ts", async (original) => ({...await original<typeof import("../../api/dataTransfer.ts")>(), readImportFile: bridge.read, importDataset: bridge.importData}));
import ImportView from "./ImportView.tsx";

const csv = "Date,Start,End,Duration,Title,Category,Parent category,Notes\n2026-03-04,09:00,10:30,1:30:00,Planning,Website,Acme,Client call\n";
const report = (overrides: Partial<ImportReport> = {}): ImportReport => ({dry_run: true, manual_entries_imported: 1, manual_entries_duplicate: 0, duplicate_indices: [], manual_entries_invalid: [], manual_categories_created: [], activity_categories_created: [], category_rules_added: 0, app_groups_added: 0, skipped_apps_added: 0, devices_added: 0, activity_logs_imported: 0, activity_logs_duplicate: 0, ...overrides});

function mount() {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<QueryClientProvider client={client}><ImportView /></QueryClientProvider>);
    return {user: userEvent.setup(), invalidate};
}

async function choose(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", {name: "Choose file"}));
    await screen.findByRole("button", {name: "Review import"});
}

beforeEach(() => {
    bridge.open.mockReset().mockResolvedValue("C:\\imports\\times.csv");
    bridge.read.mockReset().mockResolvedValue(new TextEncoder().encode(csv));
    bridge.importData.mockReset().mockImplementation(async (request: ImportRequest) => report({dry_run: request.dry_run}));
});
afterEach(cleanup);

describe("ImportView", () => {
    it("validates without writing, commits only after Import data, and refreshes cached data", async () => {
        const {user, invalidate} = mount();
        await choose(user);
        expect(bridge.open).toHaveBeenCalledWith(expect.objectContaining({multiple: false}));
        expect(bridge.read).toHaveBeenCalledWith("C:\\imports\\times.csv");
        expect(bridge.importData).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", {name: "Review import"}));
        await screen.findByRole("heading", {name: "Review your import"});
        expect(bridge.importData).toHaveBeenCalledTimes(1);
        const reviewed = bridge.importData.mock.calls[0][0] as ImportRequest;
        expect(reviewed.dry_run).toBe(true);
        expect(reviewed.duplicate_strategy).toBe("skip");
        expect(reviewed.manual_entries).toEqual([expect.objectContaining({title: "Planning", notes: "Client call", category_path: ["Acme", "Website"]})]);
        expect(invalidate).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", {name: "Import data"}));
        await screen.findByRole("heading", {name: "Import complete"});
        expect(bridge.importData.mock.calls[1][0]).toEqual({...reviewed, dry_run: false});
        expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it("blocks missing date or duration mappings and requires a fresh review after edits", async () => {
        const {user} = mount();
        await choose(user);
        await user.selectOptions(screen.getByRole("combobox", {name: "Column for Date"}), "");
        expect(screen.getByText(/Map a column to Start date/)).toBeTruthy();
        expect((screen.getByRole("button", {name: "Review import"}) as HTMLButtonElement).disabled).toBe(true);
        expect(bridge.importData).not.toHaveBeenCalled();
        await user.selectOptions(screen.getByRole("combobox", {name: "Column for Date"}), "0");
        await user.click(screen.getByRole("button", {name: "Review import"}));
        await screen.findByRole("heading", {name: "Review your import"});
        await user.click(screen.getByRole("button", {name: "Back to mapping"}));
        expect(screen.queryByRole("button", {name: "Import data"})).toBeNull();
        await user.selectOptions(screen.getByRole("combobox", {name: "Column for End time"}), "");
        await user.selectOptions(screen.getByRole("combobox", {name: "Column for Duration"}), "");
        expect(screen.getByText(/Map an End time/)).toBeTruthy();
        expect((screen.getByRole("button", {name: "Review import"}) as HTMLButtonElement).disabled).toBe(true);
        expect(bridge.importData).toHaveBeenCalledTimes(1);
    });

    it("shows duplicate and invalid rows from review and filters their details", async () => {
        bridge.read.mockResolvedValue(new TextEncoder().encode(csv + "2026-03-04,10:30,11:00,0:30:00,Second,Website,Acme,\n2026-03-04,25:99,11:00,0:30:00,Broken,Website,Acme,\n"));
        bridge.importData.mockResolvedValue(report({manual_entries_imported: 0, manual_entries_duplicate: 1, duplicate_indices: [0], manual_entries_invalid: [{index: 1, message: "Title rejected by validation"}]}));
        const {user} = mount();
        await choose(user);
        await user.click(screen.getByRole("button", {name: "Review import"}));
        await screen.findByRole("heading", {name: "Review your import"});
        expect(screen.getByText("Invalid rows will be skipped. Go back to fix mappings, or import the valid rows shown below.")).toBeTruthy();
        expect((screen.getByRole("button", {name: "Import data"}) as HTMLButtonElement).disabled).toBe(true);
        await user.click(screen.getByRole("button", {name: "Duplicates"}));
        let table = within(screen.getByRole("table"));
        expect(table.getByText("Planning")).toBeTruthy();
        expect(table.queryByText("Second")).toBeNull();
        await user.click(screen.getByRole("button", {name: "Errors"}));
        table = within(screen.getByRole("table"));
        expect(table.getByText("Title rejected by validation")).toBeTruthy();
        expect(table.getByText(/couldn't read start time/)).toBeTruthy();
        expect(table.queryByText("Planning")).toBeNull();
        expect((bridge.importData.mock.calls[0][0] as ImportRequest).manual_entries).toHaveLength(2);
        expect(bridge.importData.mock.calls.every(([request]) => request.dry_run)).toBe(true);
    });

    it("imports only the selected JSON metadata and leaves unselected records out of both requests", async () => {
        const json = {format: "time-tracker-export", version: 1,
            manual_entries: [{title: "Entry", category_id: null, category: "Uncategorized", start_time: 1772632800, end_time: 1772636400}],
            manual_categories: [{id: 1, name: "Manual", color: "#2563eb", parent_name: null}],
            activity_categories: [{name: "Work", color: "#2563eb", priority: 1, is_visible: true, in_stats: true, rules: ["Code"]}],
            devices: [{uuid: "device", name: "Laptop"}],
            activity_logs: [{device_uuid: "device", id: 1, app: "Code", timestamp: 1772632800, duration: 60}],
            app_groups: [{name: "Editors", regex: "Code"}], skipped_apps: ["Lock"]};
        bridge.open.mockResolvedValue("C:\\imports\\backup.json");
        bridge.read.mockResolvedValue(new TextEncoder().encode(JSON.stringify(json)));
        bridge.importData.mockImplementation(async (request: ImportRequest) => report({dry_run: request.dry_run, manual_entries_imported: 0, activity_categories_created: ["Work"], category_rules_added: 1}));
        const {user} = mount();
        await choose(user);
        const selections = within(screen.getByRole("region", {name: "Choose what to import"}));
        for (const checkbox of selections.getAllByRole("checkbox")) {
            if (!checkbox.closest("label")?.textContent?.startsWith("Activity categories & rules")) await user.click(checkbox);
        }
        await user.click(screen.getByRole("button", {name: "Review import"}));
        await screen.findByRole("heading", {name: "Review your import"});
        const reviewed = bridge.importData.mock.calls[0][0] as ImportRequest;
        expect(reviewed.activity_categories).toEqual(json.activity_categories);
        for (const key of ["manual_entries", "manual_categories", "devices", "activity_logs", "app_groups", "skipped_apps"] as const) expect(reviewed[key]).toEqual([]);
        expect(reviewed.dry_run).toBe(true);
        await user.click(screen.getByRole("button", {name: "Import data"}));
        await waitFor(() => expect(bridge.importData).toHaveBeenCalledTimes(2));
        expect(bridge.importData.mock.calls[1][0]).toEqual({...reviewed, dry_run: false});
    });
});
