// @vitest-environment jsdom
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import CategoriesView from "./CategoriesView.tsx";
import {ToastProvider} from "../Componants/Toast.tsx";
import {invoke} from "../../demo/mock/core.ts";

vi.mock("@tauri-apps/api/core", () => import("../../demo/mock/core.ts"));

afterEach(cleanup);

it("adds a subcategory from the new category form", async () => {
    const parentId = await invoke<number>("insert_category", {newCategory: {name: "Form parent", priority: 5000, color: "#123456"}});
    render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><ToastProvider><CategoriesView/></ToastProvider></QueryClientProvider>);

    const parent = await screen.findByRole("option", {name: "Form parent"});
    fireEvent.change(parent.closest("select")!, {target: {value: String(parentId)}});
    expect(screen.queryByPlaceholderText("Priority")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Category name"), {target: {value: "Form child"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));

    await screen.findByText("Form child");
    await waitFor(async () => {
        const categories = await invoke<{name: string; parent_id: number | null; color: string | null}[]>("get_categories");
        expect(categories.find((category) => category.name === "Form child")).toMatchObject({parent_id: parentId, color: "#123456"});
    });
});
