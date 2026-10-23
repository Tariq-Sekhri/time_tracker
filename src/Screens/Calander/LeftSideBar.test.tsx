/* @vitest-environment jsdom */
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeftSideBar from "./LeftSideBar";

afterEach(cleanup);

it("expands manual subcategories without changing their visibility", async () => {
    const toggleParentCal = vi.fn();
    const toggleChildCal = vi.fn();
    const toggleStats = vi.fn();
    render(<LeftSideBar collapsed={false} onToggleCollapsed={() => undefined} sections={[{
        key: "manual", title: "Manual tracking", items: [
            {key: "1", name: "Social", color: "green", inCal: true, inStats: true, onToggleCal: toggleParentCal, onToggleStats: toggleStats},
            {key: "2", parentKey: "1", name: "Jimin", color: "green", inCal: true, inStats: true, onToggleCal: toggleChildCal, onToggleStats: toggleStats},
        ],
    }]}/>);
    expect(screen.queryByText("Jimin")).toBeNull();
    const parent = screen.getByRole("button", {name: "Social"});
    await userEvent.click(parent);
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Jimin")).toBeTruthy();
    expect(toggleParentCal).not.toHaveBeenCalled();
    expect(toggleChildCal).not.toHaveBeenCalled();
    expect(toggleStats).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", {name: "Show Jimin in week view"}));
    expect(toggleChildCal).toHaveBeenCalledOnce();
    expect(toggleParentCal).not.toHaveBeenCalled();
    await userEvent.click(parent);
    expect(screen.queryByText("Jimin")).toBeNull();
});
