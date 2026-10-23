/* @vitest-environment jsdom */
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import ResizableSidebar from "./ResizableSidebar";
import {getAppMetadata, setAppMetadata} from "../../../api/appMetadata";

vi.mock("../../../api/appMetadata", () => ({getAppMetadata: vi.fn().mockResolvedValue(null), setAppMetadata: vi.fn().mockResolvedValue(undefined)}));
afterEach(() => {cleanup(); vi.resetAllMocks(); vi.mocked(getAppMetadata).mockResolvedValue(null); vi.mocked(setAppMetadata).mockResolvedValue(); vi.unstubAllGlobals();});

function measure(parent: HTMLElement, panel: HTMLElement, parentWidth = 1920, zoom = 1.25) {
    Object.defineProperty(parent, "clientWidth", {configurable: true, value: parentWidth});
    parent.getBoundingClientRect = () => ({width: parentWidth * zoom} as DOMRect);
    panel.getBoundingClientRect = () => ({width: parseFloat(panel.style.width) * zoom} as DOMRect);
}

function setupPointer() {
    class PointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit) {super(type, init); this.pointerId = init.pointerId ?? 1;}
    }
    vi.stubGlobal("PointerEvent", PointerEvent);
}

it.each(["left", "right"] as const)("keeps %s width across 1080p, 1440p, narrow windows, collapse and reopening", async side => {
    const preferred = side === "left" ? 300 : 460;
    vi.mocked(getAppMetadata).mockImplementation(async key => key.endsWith("width-px") ? String(preferred) : null);
    const {container, rerender} = render(<ResizableSidebar side={side} collapsed={false}>Panel</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    await waitFor(() => expect(panel.style.width).toBe(`${preferred}px`));
    for (const [parentWidth, zoom] of [[2560, 1.25], [1920, 1], [2560, 1.5], [200, 1.25], [1920, 1.25]]) {
        measure(container, panel, parentWidth, zoom);
        fireEvent.resize(window);
        expect(panel.style.width).toBe(`${Math.min(parentWidth, preferred)}px`);
    }
    rerender(<ResizableSidebar side={side} collapsed>Panel</ResizableSidebar>);
    expect(panel.style.width).toBe(side === "left" ? "56px" : "64px");
    rerender(<ResizableSidebar side={side} collapsed={false}>Panel</ResizableSidebar>);
    expect(panel.style.width).toBe(`${preferred}px`);
    expect(setAppMetadata).not.toHaveBeenCalled();
});

it.each(["left", "right"] as const)("resizes %s using logical pixels at UI zoom and enforces width limits", async side => {
    setupPointer();
    const {container} = render(<ResizableSidebar side={side} collapsed={false}>Panel</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    const start = parseFloat(panel.style.width);
    const handle = screen.getByRole("separator");
    handle.setPointerCapture = vi.fn();
    fireEvent.pointerDown(handle, {button: 0, pointerId: 1, clientX: 1000});
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: side === "left" ? 1025 : 975});
    expect(parseFloat(panel.style.width)).toBe(start + 20);
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: side === "left" ? 2000 : 0});
    expect(panel.style.width).toBe(side === "left" ? "320px" : "500px");
    fireEvent.pointerUp(handle, {pointerId: 1});
    expect(setAppMetadata).toHaveBeenLastCalledWith(`time-tracker:${side}-sidebar-width-px`, side === "left" ? "320" : "500");
    fireEvent.keyDown(handle, {key: "Home"});
    expect(panel.style.width).toBe(side === "left" ? "240px" : "250px");
    fireEvent.keyDown(handle, {key: side === "left" ? "ArrowRight" : "ArrowLeft"});
    expect(panel.style.width).toBe(side === "left" ? "250px" : "260px");
    fireEvent.keyDown(handle, {key: "End"});
    expect(panel.style.width).toBe(side === "left" ? "320px" : "500px");
});

it.each(["pointerup", "pointercancel", "blur", "lostpointercapture", "released-buttons", "collapse"])("ends resizing on %s without keeping focus or changing the width afterward", async reason => {
    setupPointer();
    const {container, rerender} = render(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    const handle = screen.getByRole("separator");
    handle.setPointerCapture = vi.fn();
    handle.focus();
    fireEvent.pointerDown(handle, {button: 0, pointerId: 1, clientX: 1000});
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 900});
    expect(panel.style.width).toBe("500px");
    expect(panel.style.userSelect).toBe("none");
    if (reason === "collapse") rerender(<ResizableSidebar collapsed>Statistics</ResizableSidebar>);
    else if (reason === "blur") fireEvent.blur(window);
    else if (reason === "lostpointercapture") fireEvent.lostPointerCapture(handle, {pointerId: 1});
    else if (reason === "released-buttons") fireEvent.pointerMove(handle, {pointerId: 1, buttons: 0, clientX: 700});
    else fireEvent(window, new PointerEvent(reason, {pointerId: 1}));
    expect(panel.style.userSelect).toBe("");
    expect(document.activeElement).not.toBe(handle);
    expect(setAppMetadata).toHaveBeenCalledExactlyOnceWith("time-tracker:right-sidebar-width-px", "500");
    if (reason === "collapse") rerender(<ResizableSidebar collapsed={false}>Statistics</ResizableSidebar>);
    fireEvent.pointerMove(handle, {pointerId: 1, buttons: 1, clientX: 0});
    expect(panel.style.width).toBe("500px");
});

it.each(["left", "right"] as const)("migrates a legacy %s percentage once and retains that pixel width on another monitor", async side => {
    vi.mocked(getAppMetadata).mockImplementation(async key => key.endsWith("width-percent") ? "15" : null);
    const {container} = render(<ResizableSidebar side={side} collapsed={false}>Panel</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    const migrated = 288;
    await waitFor(() => expect(setAppMetadata).toHaveBeenCalledWith(`time-tracker:${side}-sidebar-width-px`, String(migrated)));
    expect(panel.style.width).toBe(`${migrated}px`);
    measure(container, panel, 2560);
    fireEvent.resize(window);
    expect(panel.style.width).toBe(`${migrated}px`);
});

it("ignores late saved widths after a user has started resizing", async () => {
    let resolve!: (value: string) => void;
    vi.mocked(getAppMetadata).mockReturnValueOnce(new Promise<string>(done => {resolve = done;}));
    const {container} = render(<ResizableSidebar collapsed={false}>Panel</ResizableSidebar>);
    const panel = container.firstElementChild as HTMLElement;
    measure(container, panel);
    fireEvent.keyDown(screen.getByRole("separator"), {key: "End"});
    resolve("410");
    await waitFor(() => expect(panel.style.width).toBe("500px"));
});
