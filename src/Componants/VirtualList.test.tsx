/* @vitest-environment jsdom */
import {cleanup, fireEvent, render} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import VirtualList from "./VirtualList";

afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it("keeps a 30,000-row history bounded and reaches the final row with working actions", () => {
    vi.stubGlobal("ResizeObserver", class {observe() {} disconnect() {}});
    const clicked = vi.fn();
    const items = Array.from({length: 30_000}, (_, index) => ({id: String(index)}));
    const view = render(<VirtualList items={items} itemKey={item => item.id}
        renderItem={item => <button onClick={() => clicked(item.id)}>{item.id}</button>} />);
    expect(view.container.querySelectorAll("[data-virtual-row]").length).toBeLessThan(25);
    fireEvent.click(view.getByText("0"));
    expect(clicked).toHaveBeenLastCalledWith("0");
    const list = view.container.querySelector("[data-virtual-list]")!;
    fireEvent.scroll(list, {target: {scrollTop: 30_000 * 44 - 600}});
    expect(view.container.querySelectorAll("[data-virtual-row]").length).toBeLessThan(25);
    fireEvent.click(view.getByText("29999"));
    expect(clicked).toHaveBeenLastCalledWith("29999");
    expect(view.queryByText("0")).toBeNull();
});
