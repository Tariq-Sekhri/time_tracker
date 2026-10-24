/* @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, expect, it, vi} from "vitest";
import AppsInTimeBlock from "./AppsInTimeBlock.tsx";
import type {EventLogs} from "../types.ts";

const mocks = vi.hoisted(() => ({remove: vi.fn().mockResolvedValue(null), titleProps: vi.fn()}));
vi.mock("../../../api/Log.ts", () => ({delete_logs_by_ids: mocks.remove, count_logs_for_time_block: vi.fn(), delete_logs_for_time_block: vi.fn()}));
vi.mock("../../../api/sync.ts", () => ({getDevices: async () => [{uuid: "desktop", name: "Work PC"}, {uuid: "phone", name: "My phone"}]}));
vi.mock("../../../Componants/Toast.tsx", () => ({useToast: () => ({showToast: vi.fn()})}));
vi.mock("../../../hooks/useAppCategorizeMenu.tsx", () => ({useAppCategorizeMenu: () => ({openFromContextMenuMany: vi.fn(), categorizeLayers: null})}));
vi.mock("../../../Componants/AppTitleDetails.tsx", () => ({default: (props: {app: string; deviceUuids: string[]}) => {mocks.titleProps(props); return <span>{props.app}</span>;}}));
afterEach(() => {cleanup(); vi.clearAllMocks();});

it("labels identical titles by device and selects them independently", async () => {
    const logs: EventLogs = ["desktop", "phone"].map(device_uuid => ({ids: [1], device_uuid, app: "Video - YouTube", app_names: ["Video - YouTube"], timestamp: new Date(100000), duration: 60}));
    const setLogs = vi.fn();
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><AppsInTimeBlock selectedEvent={{title: "Watching", start: new Date(100000), end: new Date(200000), apps: []}} selectedEventLogs={logs} setSelectedEvent={vi.fn()} setSelectedEventLogs={setLogs} setRightSideBarView={vi.fn()} /></QueryClientProvider>);
    expect(await screen.findByText("Work PC")).toBeTruthy();
    expect(screen.getByText("My phone")).toBeTruthy();
    const checkboxes = screen.getAllByRole<HTMLInputElement>("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect(mocks.titleProps).toHaveBeenCalledWith(expect.objectContaining({deviceUuids: ["desktop"]}));
    expect(mocks.titleProps).toHaveBeenCalledWith(expect.objectContaining({deviceUuids: ["phone"]}));
    // Both devices have ID 1. Deleting one device's row must retain the other.
    const row = screen.getByText("Work PC").parentElement!;
    const icons = row.querySelectorAll("svg");
    fireEvent.click(icons[icons.length - 1]);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith([1], "desktop"));
    await waitFor(() => expect(setLogs).toHaveBeenCalledWith([logs[1]]));
    client.clear();
});
