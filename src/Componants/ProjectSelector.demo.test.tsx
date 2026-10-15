/* @vitest-environment jsdom */
import {useState} from "react";
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, expect, it, vi} from "vitest";
vi.mock("@tauri-apps/api/core", () => import("../../demo/mock/core"));
import ProjectSelector from "./ProjectSelector.tsx";
import {invoke} from "../../demo/mock/core";
afterEach(cleanup);

function Harness({onPick}: {onPick: (id: number | null) => void}) {
    const [value, setValue] = useState<number | null>(null);
    return <ProjectSelector value={value} onChange={(id) => {setValue(id); onPick(id);}} />;
}

it("creates, finds and selects subcategories under their category", async () => {
    const user = userEvent.setup();
    const school = await invoke<number>("create_manual_project", {name: "School"});
    await invoke<number>("create_manual_project", {name: "Study", parentId: school});
    const picked = vi.fn();
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><Harness onPick={picked} /></QueryClientProvider>);
    const trigger = screen.getByRole("button", {name: "Category"});
    await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));

    await user.click(trigger);
    expect(screen.queryByRole("option", {name: "Study"})).toBeNull();
    await user.click(screen.getByRole("button", {name: "Show School subcategories"}));
    expect(screen.getByRole("option", {name: "Study"})).toBeTruthy();
    await user.click(screen.getByRole("button", {name: "Add subcategory"}));
    await user.type(screen.getByRole("textbox", {name: "New subcategory name"}), "Homework{Enter}");
    await waitFor(() => expect(trigger.textContent).toContain("School › Homework"));
    const homework = (await invoke<Array<{id: number; name: string; parent_id: number | null}>>("get_manual_projects")).find((project) => project.name === "Homework")!;
    expect(homework.parent_id).toBe(school);
    expect(picked).toHaveBeenLastCalledWith(homework.id);

    await user.click(trigger);
    await user.type(screen.getByRole("combobox", {name: "Search categories"}), "stud");
    expect(screen.queryByRole("option", {name: "Homework"})).toBeNull();
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(trigger.textContent).toContain("School › Study"));

    await invoke("delete_manual_project", {id: school});
    expect(await invoke<unknown[]>("get_manual_projects")).toEqual([]);
    client.clear();
});
