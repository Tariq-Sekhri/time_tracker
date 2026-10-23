/* @vitest-environment jsdom */
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import ResizableSidebar from "./ResizableSidebar";
import {getAppMetadata, setAppMetadata} from "../../../api/appMetadata";

vi.mock("../../../api/appMetadata", () => ({getAppMetadata: vi.fn().mockResolvedValue(null), setAppMetadata: vi.fn().mockResolvedValue(undefined)}));
afterEach(() => {cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals();});

function measure(parent: HTMLElement, panel: HTMLElement) {
    Object.defineProperty(parent, "clientWidth", {configurable: true, value: 1000});
    // A 125% UI zoom must not change the drag distance as a percentage.
    parent.getBoundingClientRect = () => ({width: 1250} as DOMRect);
    panel.getBoundingClientRect = () => ({width: 375} as DOMRect);
}

it("drags proportionally, enforces minimum and maximum widths, and saves on release", async () => {
    class PointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit) {super(type, init); this.pointerId = init.pointerId ?? 1;}
    }
    vi.stubGlobal("PointerEvent", PointerEvent);
    const {container} = render(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    const handle = screen.getByRole("separator", {name: "Resize right sidebar"});
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, {button: 0, pointerId: 1, clientX: 875});
    fireEvent.pointerMove(handle, {pointerId: 1, clientX: 750});
    expect(panel.style.width).toBe("40%");
    fireEvent.pointerMove(handle, {pointerId: 1, clientX: 1250});
    expect(parseFloat(panel.style.width)).toBeCloseTo(28);
    fireEvent.pointerMove(handle, {pointerId: 1, clientX: 0});
    expect(panel.style.width).toBe("60%");
    expect(setAppMetadata).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, {pointerId: 1});
    expect(setAppMetadata).toHaveBeenCalledWith("time-tracker:right-sidebar-width-percent", "60");
});

it("restores the saved percentage, supports keyboard resizing and retains it after collapse", async () => {
    vi.mocked(getAppMetadata).mockResolvedValueOnce("42");
    const {container, rerender} = render(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    await waitFor(() => expect(panel.style.width).toBe("42%"));
    fireEvent.keyDown(screen.getByRole("separator"), {key: "ArrowLeft"});
    expect(panel.style.width).toBe("43%");
    rerender(<ResizableSidebar collapsed>Statistics</ResizableSidebar>);
    expect(panel.style.width).toBe("64px");
    expect(screen.queryByRole("separator")).toBeNull();
    rerender(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    expect(panel.style.width).toBe("43%");
});
