/* @vitest-environment jsdom */
import {cleanup, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, expect, it, vi} from "vitest";
vi.mock("@tauri-apps/api/core", () => import("../../demo/mock/core"));
vi.mock("@tauri-apps/api/event", () => import("../../demo/mock/event"));
import Sync from "./Sync";
import {ToastProvider} from "../Componants/Toast";
import {useSyncTimer} from "../hooks/useSyncTimer";
import {invoke, DEMO_SERVER_IP} from "../../demo/mock/core";
function DemoSync() {return <Sync syncTimer={useSyncTimer()} />;}
afterEach(() => {cleanup(); vi.unstubAllEnvs();});

it("lets demo visitors subscribe, unsubscribe, sync and leave a rejected server edit", async () => {
    vi.stubEnv("VITE_DEMO", "true");
    const user = userEvent.setup();
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><ToastProvider><DemoSync /></ToastProvider></QueryClientProvider>);
    await screen.findByText("Demo desktop");
    const laptop = screen.getByText("Demo laptop").closest("li")!;
    const phone = screen.getByText("Demo phone").closest("li")!;
    const tablet = screen.getByText("Demo tablet").closest("li")!;
    expect(within(laptop).getByRole("button", {name: "Subscribed"})).toBeTruthy();
    expect(within(phone).getByRole("button", {name: "Subscribed"})).toBeTruthy();
    await user.click(within(tablet).getByRole("button", {name: "Subscribe"}));
    await waitFor(() => expect(within(tablet).getByRole("button", {name: "Subscribed"})).toBeTruthy());
    await user.click(within(tablet).getByRole("button", {name: "Subscribed"}));
    await user.click(screen.getByRole("button", {name: "Unsubscribe"}));
    await waitFor(() => expect(within(tablet).getByRole("button", {name: "Subscribe"})).toBeTruthy());
    await user.click(screen.getByRole("button", {name: "Sync Now"}));
    await screen.findByText("Synced");
    await user.click(screen.getByRole("button", {name: "Change server"}));
    const address = screen.getByPlaceholderText("Server IP");
    await user.clear(address);
    await user.type(address, "https://external.invalid");
    await user.click(screen.getByRole("button", {name: "Connect"}));
    await screen.findByText(/No connection was made/);
    await expect(invoke("get_server_ip")).resolves.toBe(DEMO_SERVER_IP);
    await user.click(screen.getByRole("button", {name: "Cancel"}));
    await screen.findByText("Demo laptop");
    expect(screen.queryByPlaceholderText("Server IP")).toBeNull();
    client.clear();
});
