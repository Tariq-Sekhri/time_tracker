/* @vitest-environment jsdom */
import {useRef} from "react";
import {cleanup, fireEvent, render, screen, act} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import {calendarDateAtPoint, isManualRangeDrag, useHoldToCreate} from "./useHoldToCreate.ts";
import {MANUAL_HOLD_MS} from "./manualCalendarEditing.ts";
function Harness({cancel, preview}:{cancel:()=>void;preview:(x:number,y:number)=>void}) {
    const host=useRef<HTMLDivElement>(null);
    const hold=useHoldToCreate(host,cancel,preview);
    return <div ref={host} onMouseDownCapture={hold.onMouseDownCapture}>
        <div className="fc-timegrid-body"><div data-testid="slot"/><div className="fc-event" data-testid="event"/></div>
    </div>;
}
const down=(element:Element)=>fireEvent.mouseDown(element,{button:0,clientX:10,clientY:10});
afterEach(()=>{cleanup();vi.useRealTimers();});
it("leaves a single click and later hovering completely alone",()=>{
    vi.useFakeTimers();const cancel=vi.fn(),preview=vi.fn();
    render(<Harness cancel={cancel} preview={preview}/>);
    down(screen.getByTestId("slot"));fireEvent.mouseUp(document);
    fireEvent.mouseMove(document,{clientX:100,clientY:100});
    act(()=>vi.advanceTimersByTime(1000));
    expect(preview).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
});
it("does not delay a quick mouse drag or let its hold timer create a second entry",()=>{
    vi.useFakeTimers();const preview=vi.fn();
    render(<Harness cancel={vi.fn()} preview={preview}/>);
    down(screen.getByTestId("slot"));
    fireEvent.mouseMove(document,{clientX:10,clientY:30,buttons:1});
    act(()=>vi.advanceTimersByTime(MANUAL_HOLD_MS));
    expect(preview).not.toHaveBeenCalled();
    fireEvent.mouseUp(document);
});
it("previews after holding, excludes saved entries and cancels interrupted gestures",()=>{
    vi.useFakeTimers();const cancel=vi.fn(),preview=vi.fn();
    render(<Harness cancel={cancel} preview={preview}/>);
    down(screen.getByTestId("slot"));act(()=>vi.advanceTimersByTime(MANUAL_HOLD_MS-1));
    expect(preview).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1));
    expect(preview).toHaveBeenCalledExactlyOnceWith(10,10);
    fireEvent.pointerCancel(document);expect(cancel).toHaveBeenCalledOnce();
    down(screen.getByTestId("event"));act(()=>vi.advanceTimersByTime(1000));
    expect(preview).toHaveBeenCalledOnce();
});
it("maps a zoomed after-midnight slot to the next day's snapped local time",()=>{
    const host=document.createElement("div");
    host.innerHTML='<div class="fc-timegrid-col" data-date="2026-10-17"></div><div class="fc-timegrid-slot-lane" data-time="25:30:00"></div>';
    const col=host.firstElementChild!,slot=host.lastElementChild!;
    vi.spyOn(col,"getBoundingClientRect").mockReturnValue({left:100,right:300,top:50,bottom:500} as DOMRect);
    vi.spyOn(slot,"getBoundingClientRect").mockReturnValue({top:200,bottom:250,height:50} as DOMRect);
    expect(calendarDateAtPoint(host,150,238)).toEqual(new Date(2026,9,18,1,45));
    expect(calendarDateAtPoint(host,400,238)).toBeNull();
});

it("rejects click jitter across a boundary and large movement within the same time slot", () => {
    const start = new Date(2026,9,17,10,0);
    expect(isManualRangeDrag(start,new Date(2026,9,17,10,30),8)).toBe(false);
    expect(isManualRangeDrag(start,new Date(2026,9,17,10,15),25)).toBe(false);
    expect(isManualRangeDrag(start,new Date(2026,9,17,10,30),18)).toBe(true);
});
