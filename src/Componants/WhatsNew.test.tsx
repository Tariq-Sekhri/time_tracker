/* @vitest-environment jsdom */
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, expect, it, vi} from "vitest";
vi.mock("../../CHANGELOG.md?raw", () => ({default: "# Changelog\n\n## [Unreleased]\n\n- Not released yet.\n\n## [9.0.0] - 2026-10-14\n\n- Latest release note.\n\n## [8.0.0] - 2026-10-13\n\n- Previous release note.\n"}));
import WhatsNew, {REMOTE_CHANGELOG_URL} from "./WhatsNew.tsx";
import {releaseNotes} from "../../scripts/changelog.mjs";
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals();});

const remote = (changelog: string | null) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    expect(url).toBe(REMOTE_CHANGELOG_URL);
    if (changelog === null) throw new Error("offline");
    return new Response(changelog);
}));
const items = () => screen.getAllByRole("listitem").map((item) => item.textContent);

it("shows release notes after an upgrade and remembers dismissal", async () => {
    remote(null);
    localStorage.setItem("time-tracker:changelog-seen", "1.11.9");
    const view = render(<WhatsNew/>);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(items()).toEqual(["Latest release note."]);
    await userEvent.click(screen.getByRole("button", {name: "Got it"}));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    render(<WhatsNew/>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("dialog")).toBeNull();
});

it("uses notes edited on GitHub after release and shows them again once", async () => {
    remote(null);
    localStorage.setItem("time-tracker:changelog-seen", "9.0.0");
    const first = render(<WhatsNew/>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();

    remote("## [9.0.0] - 2026-10-14\r\n\r\n- Latest release note.\r\n- A missed change.\r\n");
    const second = render(<WhatsNew/>);
    await waitFor(() => expect(items()).toEqual(["Latest release note.", "A missed change."]));
    await userEvent.click(screen.getByRole("button", {name: "Got it"}));
    second.unmount();

    render(<WhatsNew/>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("dialog")).toBeNull();
});

it("treats a version without bullet notes as empty", () => {
    expect(releaseNotes("## [1.0.0]\n\n## [0.9.0]\n- Old\n", "1.0.0")).toEqual([]);
    expect(releaseNotes("## [1.0.0] - date\r\n- New\r\n-   \r\n## [0.9.0]\n- Old\n", "1.0.0")).toEqual(["New"]);
});
