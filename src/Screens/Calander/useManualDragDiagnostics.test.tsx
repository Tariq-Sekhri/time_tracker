/* @vitest-environment jsdom */
import {act, cleanup, renderHook} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import type {EventApi} from "@fullcalendar/core";
import {useManualDragDiagnostics} from "./useManualDragDiagnostics";
import {MANUAL_DRAFT_ID} from "./manualCalendarEditing";

afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.useRealTimers();});

it("distinguishes a drop that never calls back from a draft applied then reset", () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    Object.defineProperty(document, "elementFromPoint", {configurable: true, value: vi.fn(() => null)});
    const original = {start: new Date(2026, 9, 15, 10), end: new Date(2026, 9, 15, 11), title: "Private title"};
    const moved = {...original, start: new Date(2026, 9, 15, 12), end: new Date(2026, 9, 15, 13)};
    const event = {...original, id: MANUAL_DRAFT_ID} as unknown as EventApi;
    const mouse = new MouseEvent("mouseup", {clientX: 200, clientY: 300});
    const {result, rerender} = renderHook(({draft}) => useManualDragDiagnostics(draft), {initialProps: {draft: original}});
    result.current.start(event, "move", mouse);
    result.current.stop(event, mouse);
    act(() => vi.advanceTimersByTime(1000));
    expect(log.mock.calls.some(([line]) => line.includes('"outcome":"no-change-callback"') && line.includes("settled"))).toBe(true);

    result.current.start(event, "move", mouse);
    result.current.candidate(moved, true);
    result.current.stop(event, mouse);
    result.current.outcome({...event, ...moved} as EventApi, "draft-applied");
    rerender({draft: moved});
    act(() => vi.advanceTimersByTime(50));
    rerender({draft: original});
    act(() => vi.advanceTimersByTime(950));
    const last = JSON.parse(String(log.mock.lastCall?.[0]).replace("[manual-calendar] settled ", ""));
    expect(last).toMatchObject({outcome: "draft-applied", allowed: true,
        candidate: {start: moved.start.getTime()}, draft: {start: original.start.getTime()}});
    expect(log.mock.calls.flat().join(" ")).not.toContain("Private title");
});
