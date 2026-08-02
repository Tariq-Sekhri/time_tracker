/* @vitest-environment jsdom */
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {describe, expect, it, vi} from "vitest";

vi.mock("@tauri-apps/api/core", () => import("../../../demo/mock/core"));

import {ManualTimerControl} from "./ManualTimer.tsx";
import {ToastProvider} from "../../Componants/Toast.tsx";
import {invoke} from "../../../demo/mock/core";

describe("demo manual timer control", () => {
    it("starts the demo timer when Start timer is clicked", async () => {
        const user = userEvent.setup();
        const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
        render(
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <ManualTimerControl timer={null} onAddPastTime={() => undefined} />
                </ToastProvider>
            </QueryClientProvider>,
        );

        await user.click(screen.getByRole("button", {name: "Start timer"}));

        await expect(invoke("get_running_manual_timer")).resolves.toMatchObject({end_time: null});
        expect(screen.getByText("Timer started")).toBeTruthy();
    });
});
