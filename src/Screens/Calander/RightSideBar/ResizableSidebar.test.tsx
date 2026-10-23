/* @vitest-environment jsdom */
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import ResizableSidebar from "./ResizableSidebar";
import {getAppMetadata, setAppMetadata} from "../../../api/appMetadata";

vi.mock("../../../api/appMetadata", () => ({getAppMetadata: vi.fn().mockResolvedValue(null), setAppMetadata: vi.fn().mockResolvedValue(undefined)}));
afterEach(() => {cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals();});

function setupPointer() {
    class PointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit) {super(type, init); this.pointerId = init.pointerId ?? 1;}
    }
    vi.stubGlobal("PointerEvent", PointerEvent);
}

function measure(parent: HTMLElement, panel: HTMLElement) {
    Object.defineProperty(parent, "clientWidth", {configurable: true, value: 1000});
    // A 125% UI zoom must not change the drag distance as a percentage.
    parent.getBoundingClientRect = () => ({width: 1250} as DOMRect);
    panel.getBoundingClientRect = () => ({width: 375} as DOMRect);
}

it("drags proportionally, enforces minimum and maximum widths, and saves on release", async () => {
    setupPointer();
    const {container} = render(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    const handle = screen.getByRole("separator", {name: "Resize right sidebar"});
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, {button: 0, pointerId: 1, clientX: 875});
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 750});
    expect(panel.style.width).toBe("40%");
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 1250});
    expect(parseFloat(panel.style.width)).toBeCloseTo(28);
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 0});
    expect(panel.style.width).toBe("40%");
    expect(setAppMetadata).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, {pointerId: 1});
    expect(setAppMetadata).toHaveBeenCalledWith("time-tracker:right-sidebar-width-percent", "40");
    expect(panel.style.userSelect).toBe("");
    expect(document.activeElement).not.toBe(handle);
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 750});
    expect(panel.style.width).toBe("40%");
});

it.each(["pointerup", "pointercancel", "blur", "lostpointercapture", "released-buttons", "collapse"])("ends resizing on %s without leaving a focused highlight", async reason => {
    setupPointer();
    const {container, rerender} = render(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    const handle = screen.getByRole("separator");
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.focus();
    fireEvent.pointerDown(handle, {button: 0, pointerId: 1, clientX: 875});
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 750});
    expect(panel.style.userSelect).toBe("none");
    if (reason === "collapse") rerender(<ResizableSidebar collapsed>Statistics</ResizableSidebar>);
    else if (reason === "blur") fireEvent.blur(window);
    else if (reason === "lostpointercapture") fireEvent.lostPointerCapture(handle, {pointerId: 1});
    else if (reason === "released-buttons") fireEvent.pointerMove(handle, {pointerId: 1, buttons: 0, clientX: 700});
    else fireEvent(window, new PointerEvent(reason, {pointerId: 1}));
    expect(panel.style.userSelect).toBe("");
    expect(document.activeElement).not.toBe(handle);
    expect(setAppMetadata).toHaveBeenCalledExactlyOnceWith("time-tracker:right-sidebar-width-percent", "40");
});

it("resizes the left sidebar in the opposite direction and saves its width independently", async () => {
    setupPointer();
    const {container, rerender} = render(<ResizableSidebar side="left" collapsed={false}>Sources</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    const handle = screen.getByRole("separator", {name: "Resize left sidebar"});
    handle.setPointerCapture = vi.fn();
    fireEvent.pointerDown(handle, {button: 0, pointerId: 1, clientX: 375});
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 500});
    expect(panel.style.width).toBe("35%");
    fireEvent.pointerUp(handle, {pointerId: 1});
    fireEvent.keyDown(handle, {key: "ArrowLeft"});
    expect(panel.style.width).toBe("34%");
    expect(setAppMetadata).toHaveBeenLastCalledWith("time-tracker:left-sidebar-width-percent", "34");
    rerender(<ResizableSidebar side="left" collapsed>Sources</ResizableSidebar>);
    expect(panel.style.width).toBe("56px");
    rerender(<ResizableSidebar side="left" collapsed={false}>Sources</ResizableSidebar>);
    expect(panel.style.width).toBe("34%");
});

it("restores the saved percentage, supports keyboard resizing and retains it after collapse", async () => {
    vi.mocked(getAppMetadata).mockResolvedValueOnce("32");
    const {container, rerender} = render(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    await waitFor(() => expect(panel.style.width).toBe("32%"));
    fireEvent.keyDown(screen.getByRole("separator"), {key: "ArrowLeft"});
    expect(panel.style.width).toBe("33%");
    rerender(<ResizableSidebar collapsed>Statistics</ResizableSidebar>);
    expect(panel.style.width).toBe("64px");
    expect(screen.queryByRole("separator")).toBeNull();
    rerender(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    expect(panel.style.width).toBe("33%");
});

it.each(["left", "right"] as const)("caps saved and keyboard widths in pixels on a wide window (%s)", async side => {
    vi.mocked(getAppMetadata).mockResolvedValueOnce("60");
    const {container} = render(<ResizableSidebar side={side} collapsed={false}>Panel</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    Object.defineProperty(container, "clientWidth", {configurable: true, value: 2000});
    container.getBoundingClientRect = () => ({width: 2500} as DOMRect);
    const maxPercent = side === "left" ? 18 : 28;
    await waitFor(() => expect(parseFloat(panel.style.width)).toBeCloseTo(maxPercent));
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, {key: "End"});
    expect(parseFloat(panel.style.width)).toBeCloseTo(maxPercent);
    fireEvent.keyDown(handle, {key: side === "left" ? "ArrowRight" : "ArrowLeft"});
    expect(parseFloat(panel.style.width)).toBeCloseTo(maxPercent);
    expect(panel.style.maxWidth).toContain(side === "left" ? "360px" : "560px");
    Object.defineProperty(container, "clientWidth", {configurable: true, value: 500});
    fireEvent.resize(window);
    // Preserve the usable minimum when a window becomes too narrow for the percentage cap.
    expect(parseFloat(panel.style.width)).toBeCloseTo(side === "left" ? 44 : 56);
});
