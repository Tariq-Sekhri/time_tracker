/* @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, expect, it, vi} from "vitest";
vi.mock("@tauri-apps/api/core", () => import("../../demo/mock/core"));
import {invoke} from "../../demo/mock/core";
import {useAppCategorizeMenu} from "./useAppCategorizeMenu";
import {ToastProvider} from "../Componants/Toast";
import {get_categories, update_category_by_id} from "../api/Category";
import {delete_cat_regex_by_id, get_cat_regex_by_id, getMatchingCategoryRule, insert_cat_regex} from "../api/CategoryRegex";
import {useRegexNavigation} from "../stores/regexNavigationStore";
import CategoryRegexView from "../Screens/CategoryRegexView";

function Harness() {
    const {openFromContextMenu, categorizeLayers} = useAppCategorizeMenu();
    return <><div onContextMenu={(event) => openFromContextMenu(event, "Windows Explorer")}>Explorer log</div>{categorizeLayers}</>;
}
function mount(element: React.ReactNode) {
    return render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><ToastProvider>{element}</ToastProvider></QueryClientProvider>);
}
afterEach(() => {cleanup(); useRegexNavigation.getState().clear();});

it("edits and deletes the exact winning regex while preserving logs", async () => {
    const user = userEvent.setup();
    const gaming = (await get_categories()).find((category) => category.name === "Gaming")!;
    const id = await insert_cat_regex({cat_id: gaming.id, regex: "^Windows Explorer$"});
    const logsBefore = (await invoke<unknown[]>("get_logs")).length;
    try {
        mount(<Harness />);
        fireEvent.contextMenu(screen.getByText("Explorer log"), {clientX: 100, clientY: 100});
        await user.click(await screen.findByRole("button", {name: "Edit matching regex ^Windows Explorer$"}));
        await user.clear(screen.getByRole("textbox", {name: "Regex pattern"}));
        fireEvent.change(screen.getByRole("textbox", {name: "Regex pattern"}), {target: {value: "["}});
        await user.click(screen.getByRole("button", {name: "Save regex"}));
        await screen.findByRole("alert");
        expect((await get_cat_regex_by_id(id)).regex).toBe("^Windows Explorer$");
        await user.clear(screen.getByRole("textbox", {name: "Regex pattern"}));
        await user.type(screen.getByRole("textbox", {name: "Regex pattern"}), "(?i)^Explorer rule test$");
        await user.click(screen.getByRole("button", {name: "Save regex"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect((await get_cat_regex_by_id(id)).regex).toBe("(?i)^Explorer rule test$");
        expect((await getMatchingCategoryRule("Windows Explorer")).rule?.id).not.toBe(id);
        // Open the same menu for a log that now matches the edited rule.
        cleanup();
        function EditedHarness() {
            const {openFromContextMenu, categorizeLayers} = useAppCategorizeMenu();
            return <><div onContextMenu={(event) => openFromContextMenu(event, "Explorer rule test")}>Edited log</div>{categorizeLayers}</>;
        }
        mount(<EditedHarness />);
        fireEvent.contextMenu(screen.getByText("Edited log"), {clientX: 100, clientY: 100});
        await user.click(await screen.findByRole("button", {name: "Delete matching regex (?i)^Explorer rule test$"}));
        expect(await get_cat_regex_by_id(id)).toBeTruthy();
        await user.click(screen.getByRole("button", {name: "Delete regex"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await expect(get_cat_regex_by_id(id)).rejects.toThrow();
        expect((await invoke<unknown[]>("get_logs")).length).toBe(logsBefore);
    } finally {await delete_cat_regex_by_id(id);}
});

it("links to the responsible rule and focuses its editor even in a filtered, collapsed group", async () => {
    const user = userEvent.setup();
    const gaming = {...(await get_categories()).find((category) => category.name === "Gaming")!};
    const id = await insert_cat_regex({cat_id: gaming.id, regex: "^Windows Explorer$"});
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
        await update_category_by_id({...gaming, regex_enabled: false, is_collapsed: true});
        await invoke("set_app_metadata", {key: "time-tracker:cat-regex:group-by-category", value: "true"});
        mount(<Harness />);
        fireEvent.contextMenu(screen.getByText("Explorer log"), {clientX: 100, clientY: 100});
        await user.click(await screen.findByRole("button", {name: /Matching regex.*Gaming.*\^Windows Explorer\$/}));
        expect(useRegexNavigation.getState().targetId).toBe(id);
        cleanup();
        mount(<CategoryRegexView />);
        const input = await screen.findByRole("textbox", {name: "Regex pattern"});
        await waitFor(() => expect(document.activeElement).toBe(input));
        expect((input as HTMLInputElement).value).toBe("^Windows Explorer$");
        expect(document.querySelector(`[data-regex-id="${id}"]`)).toBeTruthy();
        expect((await get_categories()).find((row) => row.id === gaming.id)?.regex_enabled).toBe(false);
        expect(scroll).toHaveBeenCalled();
    } finally {
        await delete_cat_regex_by_id(id); await update_category_by_id(gaming);
        await invoke("delete_app_metadata", {key: "time-tracker:cat-regex:group-by-category"});
    }
});
