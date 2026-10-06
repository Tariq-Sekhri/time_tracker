/* @vitest-environment jsdom */
import {cleanup, render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import AppTitleDetails from "./AppTitleDetails.tsx";
import {get_log_by_id, get_logs_for_app_in_time_range} from "../api/Log.ts";

vi.mock("../api/Log.ts", () => ({get_log_by_id: vi.fn(), get_logs_for_app_in_time_range: vi.fn()}));

beforeEach(() => {
    vi.resetAllMocks();
    HTMLDialogElement.prototype.showModal = function () {this.setAttribute("open", "");};
    HTMLDialogElement.prototype.close = function () {this.removeAttribute("open");};
});
afterEach(cleanup);

function mount(props: Partial<Parameters<typeof AppTitleDetails>[0]> = {}, onRowClick = vi.fn()) {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(<QueryClientProvider client={client}><div onClick={onRowClick}>
        <AppTitleDetails app="YouTube" appNames={["Video A - YouTube", "Video B - YouTube"]} start={100} end={200} {...props} />
    </div></QueryClientProvider>);
    return onRowClick;
}

describe("exact title drill-down", () => {
    it("loads on click, keeps range/device/title scope, and combines repeated exact titles", async () => {
        vi.mocked(get_logs_for_app_in_time_range).mockResolvedValue([
            {id: 1, device_uuid: "desktop", app: "Video A - YouTube", timestamp: 110, duration: 60},
            {id: 2, device_uuid: "desktop", app: "Video A - YouTube", timestamp: 120, duration: 60},
            {id: 3, device_uuid: "phone", app: "Video B - YouTube", timestamp: 130, duration: 90},
            {id: 4, device_uuid: "desktop", app: "Outside category", timestamp: 140, duration: 90},
        ]);
        const onRowClick = mount({deviceUuids: ["desktop"]});
        expect(get_logs_for_app_in_time_range).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", {name: "View exact titles for YouTube"}));
        expect(await screen.findByText("Video A - YouTube")).toBeTruthy();
        expect(get_logs_for_app_in_time_range).toHaveBeenCalledWith("YouTube", 100, 200, 1);
        expect(screen.queryByText("Video B - YouTube")).toBeNull();
        expect(screen.queryByText("Outside category")).toBeNull();
        expect(screen.getByText("1 title · Total: 2m")).toBeTruthy();
        expect(onRowClick).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", {name: "Close title details"}));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("uses only the selected block IDs instead of pulling other activity in its range", async () => {
        vi.mocked(get_log_by_id).mockResolvedValue({id: 7, device_uuid: "desktop", app: "Video B - YouTube", timestamp: new Date(), duration: 30, is_deleted: false});
        mount({ids: [7, 7]});
        await userEvent.click(screen.getByRole("button", {name: "View exact titles for YouTube"}));
        expect(await screen.findByText("Video B - YouTube")).toBeTruthy();
        expect(get_log_by_id).toHaveBeenCalledTimes(1);
        expect(get_log_by_id).toHaveBeenCalledWith(7);
        expect(get_logs_for_app_in_time_range).not.toHaveBeenCalled();
    });

    it("shows a recoverable error without losing the selected group", async () => {
        vi.mocked(get_logs_for_app_in_time_range).mockRejectedValueOnce(new Error("Could not load titles"))
            .mockResolvedValueOnce([]);
        mount();
        await userEvent.click(screen.getByRole("button", {name: "View exact titles for YouTube"}));
        expect(within(await screen.findByRole("alert")).getByText(/Could not load titles/)).toBeTruthy();
        await userEvent.click(screen.getByRole("button", {name: "Retry"}));
        expect(await screen.findByText("No recorded titles in this selection.")).toBeTruthy();
    });
});
