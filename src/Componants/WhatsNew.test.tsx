/* @vitest-environment jsdom */
import {cleanup, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, expect, it, vi} from "vitest";
vi.mock("../../CHANGELOG.md?raw", () => ({default: "# Changelog\n\n## [Unreleased]\n\n- Not released yet.\n\n## [9.0.0] - 2026-10-14\n\n- Latest release note.\n\n## [8.0.0] - 2026-10-13\n\n- Previous release note.\n"}));
import WhatsNew from "./WhatsNew.tsx";
afterEach(() => {cleanup(); localStorage.clear();});
it("shows release notes after an upgrade and remembers dismissal", async () => {
    localStorage.setItem("time-tracker:changelog-seen", "1.11.9");
    const view = render(<WhatsNew/>);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([
        "Latest release note.",
    ]);
    await userEvent.click(screen.getByRole("button", {name: "Got it"}));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    render(<WhatsNew/>);
    expect(screen.queryByRole("dialog")).toBeNull();
});
