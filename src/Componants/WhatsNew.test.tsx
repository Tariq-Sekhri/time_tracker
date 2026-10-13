/* @vitest-environment jsdom */
import {cleanup, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, expect, it} from "vitest";
import WhatsNew from "./WhatsNew.tsx";
afterEach(() => {cleanup(); localStorage.clear();});
it("shows release notes after an upgrade and remembers dismissal", async () => {
    localStorage.setItem("time-tracker:changelog-seen", "1.11.9");
    const view = render(<WhatsNew/>);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([
        "Patch version update with no feature or behavior changes.",
    ]);
    await userEvent.click(screen.getByRole("button", {name: "Got it"}));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    render(<WhatsNew/>);
    expect(screen.queryByRole("dialog")).toBeNull();
});
