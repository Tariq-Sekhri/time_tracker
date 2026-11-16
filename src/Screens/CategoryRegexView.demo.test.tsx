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
    fireEvent.change(screen.getByRole("combobox", {name: "Match using"}), {target: {value: "regex"}});
    fireEvent.change(screen.getByPlaceholderText("Regex pattern"), {target: {value: "^view homework"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));

    expect(await screen.findByText("^view homework")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Auto"}));
    await waitFor(() => expect(screen.queryByText("^view homework")).toBeNull());
    fireEvent.click(screen.getByRole("button", {name: "Manual"}));
    expect(await screen.findByText("^view homework")).toBeTruthy();
});


it("saves ordinary names literally by default and matches prefixed titles", async () => {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><ToastProvider><CategoryRegexView/></ToastProvider></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", {name: "Select category"}));
    fireEvent.click(await screen.findByRole("button", {name: "View school"}));
    fireEvent.change(screen.getByRole("textbox", {name: "Text to match"}), {target: {value: "T3 Code (Beta)"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));
    await screen.findByText("T3 Code (Beta)");
    const rules = await invoke<Array<{id: number; regex: string; manual_project_id: number}>>("get_category_rules");
    const rule = rules.find((rule) => rule.regex === String.raw`T3 Code \(Beta\)`)!;
    expect(rule).toBeTruthy();
    expect(await invoke("match_manual_rule", {title: "Project - Thread - T3 Code (Beta)"})).toBe(rule.manual_project_id);
    expect(await invoke("match_manual_rule", {title: "Project - Thread - T3 Code Beta"})).not.toBe(rule.manual_project_id);
    await invoke("delete_cat_regex_by_id", {id: rule.id});
    client.clear();
});
