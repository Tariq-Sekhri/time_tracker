// @vitest-environment jsdom
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeAll, expect, it, vi} from "vitest";
import CategoryRegexView from "./CategoryRegexView.tsx";
import {ToastProvider} from "../Componants/Toast.tsx";
import {invoke} from "../../demo/mock/core.ts";

vi.mock("@tauri-apps/api/core", () => import("../../demo/mock/core.ts"));

beforeAll(async () => {
    await invoke("create_manual_project", {name: "View school"});
});
afterEach(cleanup);

it("adds a manual rule from the one rule list and filters it by type", async () => {
    render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><ToastProvider><CategoryRegexView/></ToastProvider></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", {name: "Select category"}));
    fireEvent.click(await screen.findByRole("button", {name: "View school"}));
    fireEvent.change(screen.getByPlaceholderText("Regex pattern"), {target: {value: "^view homework"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));

    expect(await screen.findByText("^view homework")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Auto"}));
    await waitFor(() => expect(screen.queryByText("^view homework")).toBeNull());
    fireEvent.click(screen.getByRole("button", {name: "Manual"}));
    expect(await screen.findByText("^view homework")).toBeTruthy();
});
