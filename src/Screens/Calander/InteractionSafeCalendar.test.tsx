/* @vitest-environment jsdom */
import {createRef, StrictMode} from "react";
import {cleanup, render} from "@testing-library/react";
import {afterEach, expect, it} from "vitest";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import InteractionSafeCalendar from "./InteractionSafeCalendar";

afterEach(cleanup);

it("defers incoming event and option updates during a gesture, then applies the latest props", () => {
    const calendarRef = createRef<FullCalendar>();
    const interactionLock = {current: false};
    const plugins = [timeGridPlugin];
    const events = [{id: "draft", start: "2026-10-15T10:00:00", end: "2026-10-15T11:00:00"}];
    const view = (latestEvents = events, slotDuration = "00:30:00") => <StrictMode><InteractionSafeCalendar
        ref={calendarRef} interactionLock={interactionLock} plugins={plugins} initialView="timeGridWeek"
        initialDate="2026-10-15" events={latestEvents} slotDuration={slotDuration}
    /></StrictMode>;
    const rendered = render(view());
    const api = calendarRef.current!.getApi();
    interactionLock.current = true;
    const moved = [{...events[0], start: "2026-10-16T12:00:00", end: "2026-10-16T13:00:00"}];
    rendered.rerender(view(moved, "01:00:00"));
    expect(api.getEventById("draft")!.start!.getTime()).toBe(new Date(events[0].start).getTime());
    expect(api.getOption("slotDuration")).toBe("00:30:00");
    interactionLock.current = false;
    rendered.rerender(view(moved, "01:00:00"));
    expect(api.getEventById("draft")!.start!.getTime()).toBe(new Date(moved[0].start).getTime());
    expect(api.getOption("slotDuration")).toBe("01:00:00");
});
