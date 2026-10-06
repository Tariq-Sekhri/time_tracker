/* @vitest-environment jsdom */
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider, useQuery} from "@tanstack/react-query";
import {afterEach, describe, expect, it, vi} from "vitest";

vi.mock("@tauri-apps/api/core", () => import("../../../demo/mock/core"));

import {ManualTimerControl} from "./ManualTimer.tsx";
import {ToastProvider} from "../../Componants/Toast.tsx";
import {invoke} from "../../../demo/mock/core";
import {get_running_manual_timer} from "../../api/ManualTimeBlock.ts";

function TimerHarness() {
    const {data} = useQuery({queryKey: ["runningManualTimer"], queryFn: get_running_manual_timer});
    return <ManualTimerControl timer={data ?? null} onAddPastTime={() => undefined} />;
}

afterEach(cleanup);

describe("demo manual timer control", () => {
    it("starts and records unnamed time with no project", async () => {
        const user = userEvent.setup();
        const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
        render(<QueryClientProvider client={queryClient}><ToastProvider><TimerHarness /></ToastProvider></QueryClientProvider>);
        await user.click(screen.getByRole("button", {name: "Start"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Done"})).toBeTruthy());
        const timer = await get_running_manual_timer();
        expect(timer).toMatchObject({title: "", project_id: null, end_time: null});
        await user.click(screen.getByRole("button", {name: "Done"}));
        await waitFor(async () => expect(await get_running_manual_timer()).toBeNull());
        const blocks = await invoke<Array<{id: number; title: string; project_id: number | null}>>("get_manual_time_blocks", {rangeStart: timer!.start_time - 1, rangeEnd: timer!.start_time + 60});
        expect(blocks).toContainEqual(expect.objectContaining({title: "Unnamed", project_id: null}));
        for (const block of blocks) await invoke("delete_manual_time_block", {id: block.id});
        queryClient.clear();
    });
    it("starts on name blur, keeps Project focused, saves project changes and records without a naming dialog", async () => {
        const user = userEvent.setup();
        const projectId = await invoke<number>("create_manual_project", {name: "Focus project"});
        const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
        render(
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <TimerHarness />
                </ToastProvider>
            </QueryClientProvider>,
        );

        await waitFor(() => expect((screen.getByRole("combobox", {name: "Project"}) as HTMLSelectElement).disabled).toBe(false));
        const input = screen.getByRole("textbox", {name: "Timer task name"});
        await user.click(input);
        await user.tab();
        await expect(invoke("get_running_manual_timer")).resolves.toBeNull();
        await user.click(input);
        await user.type(input, "Planning");
        await expect(invoke("get_running_manual_timer")).resolves.toBeNull();
        await user.tab();
        expect(document.activeElement).toBe(screen.getByRole("combobox", {name: "Project"}));
        await user.selectOptions(screen.getByRole("combobox", {name: "Project"}), String(projectId));
        await waitFor(async () => {
            await expect(invoke("get_running_manual_timer")).resolves.toMatchObject({title: "Planning", project_id: projectId, end_time: null});
        });
        const original = await get_running_manual_timer();
        await user.click(input);
        await user.clear(input);
        await user.type(input, "Planning notes");
        await user.tab();
        await waitFor(async () => {
            await expect(invoke("get_running_manual_timer")).resolves.toMatchObject({title: "Planning notes", start_time: original!.start_time, project_id: projectId});
        });
        await user.click(screen.getByRole("button", {name: "Done"}));
        await waitFor(async () => {
            await expect(invoke("get_running_manual_timer")).resolves.toBeNull();
        });
        const blocks = await invoke<Array<{id: number; project_id: number | null; title: string}>>("get_manual_time_blocks", {rangeStart: original!.start_time - 1, rangeEnd: original!.start_time + 3600});
        expect(blocks).toContainEqual(expect.objectContaining({title: "Planning notes", project_id: projectId}));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect((input as HTMLInputElement).value).toBe("");
        for (const block of blocks) await invoke("delete_manual_time_block", {id: block.id});
        await invoke("delete_manual_project", {id: projectId});
        queryClient.clear();
    });
});
