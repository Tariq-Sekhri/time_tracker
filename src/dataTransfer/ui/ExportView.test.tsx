/* @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {ExportFilterOptions, ExportScope} from "../../api/dataTransfer.ts";
import {sampleDataset} from "../formats/export/fixtures.ts";
import ExportView from "./ExportView.tsx";

const mocks = vi.hoisted(() => ({
    filters: vi.fn(), export: vi.fn(), write: vi.fn(), metadata: vi.fn(), setMetadata: vi.fn(),
    save: vi.fn(), open: vi.fn(), reveal: vi.fn(), toast: vi.fn(),
}));

vi.mock("../../api/dataTransfer.ts", async (original) => ({
    ...await original<typeof import("../../api/dataTransfer.ts")>(),
    getExportFilterOptions: mocks.filters, exportDataset: mocks.export, saveExportFile: mocks.write,
}));
vi.mock("../../api/appMetadata.ts", () => ({getAppMetadata: mocks.metadata, setAppMetadata: mocks.setMetadata}));
vi.mock("@tauri-apps/plugin-dialog", () => ({save: mocks.save, open: mocks.open}));
vi.mock("@tauri-apps/plugin-opener", () => ({revealItemInDir: mocks.reveal}));
vi.mock("@tauri-apps/api/path", () => ({join: (...parts: string[]) => Promise.resolve(parts.join("/"))}));
vi.mock("../../Componants/Toast.tsx", () => ({useToast: () => ({showToast: mocks.toast})}));

const filterOptions: ExportFilterOptions = {
    devices: [
        {uuid: "desk", name: "Office desktop", kind: "local", in_cal: true, in_stats: true},
        {uuid: "phone", name: "Work phone", kind: "remote", in_cal: true, in_stats: true},
    ],
    activity_categories: [{name: "Coding", color: "#2563eb"}, {name: "Browsing", color: null}],
    manual_categories: [
        {id: null, name: "Uncategorized", color: "#0ea5e9", parent_id: null, parent_name: null},
        {id: 1, name: "Client", color: "#2563eb", parent_id: null, parent_name: null},
        {id: 2, name: "Website", color: "#2563eb", parent_id: 1, parent_name: "Client"},
        {id: 3, name: "Admin", color: "#34d399", parent_id: null, parent_name: null},
    ],
    data_start: 1_772_323_200, data_end: 1_774_915_200,
};
const clients: QueryClient[] = [];

beforeEach(() => {
    vi.resetAllMocks();
    mocks.filters.mockResolvedValue(filterOptions);
    mocks.metadata.mockImplementation(async (key: string) => key === "data_export_last_v1"
        ? JSON.stringify({scopeTemplate: {}, options: {summaryGrouping: "none"}})
        : null);
    mocks.setMetadata.mockResolvedValue(undefined);
    mocks.write.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue("C:/Exports/time.csv");
    mocks.export.mockImplementation(async (scope: ExportScope) => {
        const dataset = sampleDataset();
        for (const key of Object.keys(scope.include) as (keyof ExportScope["include"])[]) {
            if (!scope.include[key]) dataset[key] = [] as never;
        }
        return dataset;
    });
});
afterEach(() => {cleanup(); for (const client of clients.splice(0)) client.clear();});

function mount() {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
    clients.push(client);
    render(<QueryClientProvider client={client}><ExportView /></QueryClientProvider>);
    return userEvent.setup();
}
const exportButton = () => screen.getByRole<HTMLButtonElement>("button", {name: "Export"});
const previewButton = () => screen.getByRole<HTMLButtonElement>("button", {name: "Preview"});
async function readyCsv(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => expect(mocks.filters).toHaveBeenCalled());
    await user.click(screen.getByText("Scope", {exact: true}));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", {name: /^Manual categories All/}).disabled).toBe(false));
    await user.click(screen.getByRole("button", {name: /2.*Design output/}));
    await user.click(screen.getByRole("radio", {name: /^CSV/}));
    await waitFor(() => expect(exportButton().disabled).toBe(false));
}

describe("ExportView", () => {
    it("keeps the focused three-step workflow and makes scope an optional compact control", async () => {
        const user = mount();
        await readyCsv(user);
        expect(screen.queryByRole("radiogroup", {name: "Export layout"})).toBeNull();
        expect(within(screen.getByRole("navigation", {name: "Export workflow"})).getAllByRole("button")).toHaveLength(3);
        expect(screen.queryByRole("button", {name: /Set scope/})).toBeNull();
        expect(screen.getByText("All time / All devices & categories")).toBeTruthy();
        await user.click(screen.getByText("Scope", {exact: true}));
        expect(screen.getByText("Scope", {exact: true}).closest("details")!.open).toBe(false);
        await user.selectOptions(screen.getByRole("combobox", {name: "Preset"}), "builtin:Project report");
        fireEvent.change(screen.getByRole("spinbutton", {name: "Hourly rate (optional)"}), {target: {value: "125"}});
        await user.click(screen.getByRole("button", {name: "Next"}));
        expect(screen.getByRole("complementary", {name: "Export selection summary"})).toBeTruthy();
        await user.click(screen.getByRole("button", {name: "Back"}));
        expect((screen.getByRole("spinbutton", {name: "Hourly rate (optional)"}) as HTMLInputElement).value).toBe("125");
        await user.click(exportButton());
        await waitFor(() => expect(mocks.write).toHaveBeenCalled(), {timeout: 5000});
        expect(mocks.export).toHaveBeenLastCalledWith(expect.objectContaining({manual_category_ids: null}));
    });

    it("allows all project categories by default and supports optional narrowing and pricing", async () => {
        const user = mount();
        await readyCsv(user);
        await user.selectOptions(screen.getByRole("combobox", {name: "Preset"}), "builtin:Project report");
        expect(exportButton().disabled).toBe(false);
        expect((screen.getByRole("spinbutton", {name: "Hourly rate (optional)"}) as HTMLInputElement).value).toBe("");
        await user.click(screen.getByRole("button", {name: /^Manual categories/}));
        const categories = screen.getByRole("dialog", {name: "Choose manual categories"});
        await user.click(within(categories).getByRole("button", {name: "Select none"}));
        await user.click(within(categories).getByRole("checkbox", {name: "Client"}));
        await user.keyboard("{Escape}");
        await waitFor(() => expect(exportButton().disabled).toBe(false));
        await waitFor(() => expect(mocks.export).toHaveBeenLastCalledWith(expect.objectContaining({
            manual_category_ids: [1, 2],
        })));
        fireEvent.change(screen.getByRole("spinbutton", {name: "Hourly rate (optional)"}), {target: {value: "-5"}});
        expect(exportButton().disabled).toBe(true);
        fireEvent.change(screen.getByRole("spinbutton", {name: "Hourly rate (optional)"}), {target: {value: "125"}});
        expect(exportButton().disabled).toBe(false);
        await user.click(exportButton());
        await waitFor(() => expect(mocks.write).toHaveBeenCalled(), {timeout: 5000});
        expect(mocks.export).toHaveBeenLastCalledWith(expect.objectContaining({
            manual_category_ids: [1, 2], include: expect.objectContaining({manual_entries: true, activity_sessions: false}),
        }));
        await user.click(screen.getByRole("button", {name: "Use everything"}));
        expect(screen.getByText("All time / All devices & categories")).toBeTruthy();
        expect((screen.getByRole("spinbutton", {name: "Hourly rate (optional)"}) as HTMLInputElement).value).toBe("125");
        await waitFor(() => expect(exportButton().disabled).toBe(false));
        await user.click(exportButton());
        await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2), {timeout: 5000});
        expect(mocks.export).toHaveBeenLastCalledWith(expect.objectContaining({manual_category_ids: null}));


    });

    it("applies common-use presets without writing files and lets users save their own version", async () => {
        const user = mount();
        await readyCsv(user);
        const picker = screen.getByRole("combobox", {name: "Preset"});
        expect(within(picker).getAllByRole("option")).toHaveLength(14);
        const confirmed = within(picker).getByRole("group", {name: "Confirmed presets"});
        expect(within(confirmed).getAllByRole("option").map(option => option.textContent)).toEqual(["Archiver", "Project report"]);
        await user.selectOptions(picker, "builtin:Archiver");
        expect(screen.getByRole("radio", {name: /^JSON/}).getAttribute("aria-checked")).toBe("true");
        await user.click(screen.getByRole("radio", {name: /^CSV/}));
        expect(screen.getByRole("radio", {name: /^CSV/}).getAttribute("aria-checked")).toBe("true");
        await user.selectOptions(picker, "builtin:Keep a portable copy");
        expect(screen.getByRole("radio", {name: /^JSON/}).getAttribute("aria-checked")).toBe("true");
        expect(screen.queryByRole("button", {name: /^Delete preset/})).toBeNull();
        await user.selectOptions(picker, "builtin:Submit a timesheet");
        expect(screen.getByRole("radio", {name: /^Excel/}).getAttribute("aria-checked")).toBe("true");
        await user.click(screen.getByRole("button", {name: /Save as preset/}));
        const name = screen.getByRole("textbox", {name: "Preset name"});
        await user.clear(name);
        await user.type(name, "My weekly timesheet");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await screen.findByRole("button", {name: "Delete preset My weekly timesheet"})).toBeTruthy();
        expect(mocks.save).not.toHaveBeenCalled();
        expect(mocks.write).not.toHaveBeenCalled();
    });

    it("blocks preview and export until filter options load", async () => {
        mocks.filters.mockReturnValue(new Promise(() => {}));
        mount();
        expect(exportButton().disabled).toBe(true);
        expect(previewButton().disabled).toBe(true);
        fireEvent.click(exportButton());
        expect(mocks.save).not.toHaveBeenCalled();
        expect(mocks.write).not.toHaveBeenCalled();
    });

    it("blocks an empty dataset selection", async () => {
        const user = mount();
        await readyCsv(user);
        await user.click(screen.getByRole("button", {name: /1.*Choose data/}));
        await user.click(screen.getByRole("checkbox", {name: /^Manual time entries/}));
        expect(exportButton().disabled).toBe(true);
        expect(previewButton().disabled).toBe(true);
        expect(screen.getByText("Choose at least one thing to export.", {selector: ".dt-footer-summary small"})).toBeTruthy();
        expect(mocks.save).not.toHaveBeenCalled();
    });

    it("sends selected devices, activity categories and parent plus child manual categories", async () => {
        const user = mount();
        await readyCsv(user);
        await user.click(screen.getByRole("button", {name: /1.*Choose data/}));
        await user.click(screen.getByRole("checkbox", {name: /^Activity sessions/}));
        await user.click(screen.getByRole("button", {name: /^Devices All/}));
        const devices = screen.getByRole("dialog", {name: "Choose devices"});
        await user.click(within(devices).getByRole("checkbox", {name: /Work phone/}));
        await user.keyboard("{Escape}");
        await user.click(screen.getByRole("button", {name: /^Activity categories All/}));
        const activities = screen.getByRole("dialog", {name: "Choose categories"});
        await user.click(within(activities).getByRole("checkbox", {name: "Browsing"}));
        await user.keyboard("{Escape}");
        await user.click(screen.getByRole("button", {name: /^Manual categories All/}));
        const categories = screen.getByRole("dialog", {name: "Choose manual categories"});
        await user.click(within(categories).getByRole("button", {name: "Select none"}));
        await user.click(within(categories).getByRole("checkbox", {name: "Client"}));
        expect(within(categories).getByRole<HTMLInputElement>("checkbox", {name: "Website"}).checked).toBe(true);
        await user.keyboard("{Escape}");
        await user.click(previewButton());
        await screen.findByRole("dialog", {name: /Preview/});
        expect(mocks.export).toHaveBeenCalledWith(expect.objectContaining({
            device_uuids: ["desk"], activity_categories: ["Coding"], manual_category_ids: [1, 2],
            include: expect.objectContaining({manual_entries: true, activity_sessions: true, activity_logs: false}),
        }));
        expect(mocks.save).not.toHaveBeenCalled();
        expect(mocks.open).not.toHaveBeenCalled();
        expect(mocks.write).not.toHaveBeenCalled();
    });

    it.each(["Clockify", "Toggl Track"])("requires a valid email for %s", async (framework) => {
        const user = mount();
        await readyCsv(user);
        await user.click(screen.getByRole("radio", {name: new RegExp(`^${framework}`)}));
        expect(exportButton().disabled).toBe(true);
        expect(previewButton().disabled).toBe(true);
        fireEvent.change(screen.getByRole("textbox", {name: /^Email/}), {target: {value: "invalid"}});
        expect(exportButton().disabled).toBe(true);
        fireEvent.change(screen.getByRole("textbox", {name: /^Email/}), {target: {value: "jane@example.com"}});
        await waitFor(() => expect(exportButton().disabled).toBe(false));
        expect(mocks.save).not.toHaveBeenCalled();
    });

    it("requires first and last name for Harvest", async () => {
        const user = mount();
        await readyCsv(user);
        await user.click(screen.getByRole("radio", {name: /^Harvest/}));
        expect(exportButton().disabled).toBe(true);
        const name = screen.getByLabelText("Your name (first and last)");
        fireEvent.change(name, {target: {value: "Jane"}});
        expect(exportButton().disabled).toBe(true);
        fireEvent.change(name, {target: {value: "Jane Doe"}});
        await waitFor(() => expect(exportButton().disabled).toBe(false));
    });

    it("previews real CSV rows without opening save dialogs or writing files", async () => {
        const user = mount();
        await readyCsv(user);
        await user.click(previewButton());
        const dialog = await screen.findByRole("dialog", {name: /Preview/});
        await waitFor(() => expect(within(dialog).getByText("Design review")).toBeTruthy());
        expect(mocks.save).not.toHaveBeenCalled();
        expect(mocks.open).not.toHaveBeenCalled();
        expect(mocks.write).not.toHaveBeenCalled();
    });

    it("writes generated CSV bytes only after the user chooses a destination", async () => {
        const user = mount();
        await readyCsv(user);
        await user.click(exportButton());
        await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
        const [path, bytes] = mocks.write.mock.calls[0] as [string, Uint8Array];
        expect(path).toBe("C:/Exports/time.csv");
        expect(Object.prototype.toString.call(bytes)).toBe("[object Uint8Array]");
        const csv = new TextDecoder().decode(bytes);
        expect(csv).toContain("Design review");
        expect(csv).toContain('"With ""Bob"", Alice"');
        expect(csv).toContain("Duration");
        expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({title: "Save export"}));
        await screen.findByText("Export complete.");
    });

    it("does not write a file when the save dialog is cancelled", async () => {
        mocks.save.mockResolvedValue(null);
        const user = mount();
        await readyCsv(user);
        await user.click(exportButton());
        await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
        await waitFor(() => expect(exportButton().disabled).toBe(false));
        expect(mocks.write).not.toHaveBeenCalled();
        expect(screen.queryByText("Export complete.")).toBeNull();
    });
});
