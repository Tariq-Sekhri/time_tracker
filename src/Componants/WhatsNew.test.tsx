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
        "Edit names and colors for categories, manual categories, and Google Calendars directly from the Sources sidebar; Uncategorized has an editable color and a fixed name.",
        "Adjust tracked category priority, with editors kept beside their source and inside the viewport even at increased UI scale.",
        "Hide tracked activity during recorded AFK time by default, separately for each device, and sync AFK history across devices.",
        "Use Include AFK to inspect grouped away blocks, their recorded sources, confidence, and captured logs without mixing those logs into normal activity.",
        "Fix overnight activity caused by short AFK recording gaps and keep AFK cards and captured logs within their calendar times.",
    ]);
    await userEvent.click(screen.getByRole("button", {name: "Got it"}));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    render(<WhatsNew/>);
    expect(screen.queryByRole("dialog")).toBeNull();
});
