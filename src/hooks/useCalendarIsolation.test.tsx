// @vitest-environment jsdom
import {act, renderHook} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {useCalendarIsolation} from "./useCalendarIsolation.ts";

describe("calendar source isolation", () => {
    it("combines device and category isolation and restores each independently", () => {
        const {result} = renderHook(useCalendarIsolation);
        act(() => result.current.toggleDevice("desktop"));
        expect(result.current.category).toBeNull();
        act(() => result.current.toggleCategory(4));
        expect(result.current.device).toBe("desktop");
        expect(result.current.category).toBe(4);
        expect(result.current.showTracked).toBe(true);
        expect(result.current.showGoogle).toBe(false);
        expect(result.current.showManual).toBe(false);
        act(() => result.current.toggleDevice("phone"));
        expect(result.current.category).toBe(4);
        act(() => result.current.toggleDevice("phone"));
        expect(result.current.device).toBeNull();
        expect(result.current.category).toBe(4);
        act(() => result.current.toggleCategory(4));
        expect(result.current.active).toBe(false);
        expect(result.current.showGoogle).toBe(true);
        expect(result.current.showManual).toBe(true);
    });

    it("switches between incompatible sources, including No project", () => {
        const {result} = renderHook(useCalendarIsolation);
        act(() => result.current.toggleDevice("desktop"));
        act(() => result.current.toggleCalendar(3));
        expect(result.current.device).toBeNull();
        expect(result.current.showGoogle).toBe(true);
        expect(result.current.showTracked).toBe(false);
        expect(result.current.showManual).toBe(false);
        act(() => result.current.toggleProject(null));
        expect(result.current.calendar).toBeNull();
        expect(result.current.project).toEqual({id: null});
        expect(result.current.showManual).toBe(true);
        expect(result.current.showGoogle).toBe(false);
        act(() => result.current.toggleProject(null));
        expect(result.current.active).toBe(false);
        act(() => result.current.toggleProject(9));
        act(() => result.current.toggleCategory(2));
        expect(result.current.project).toBeNull();
        expect(result.current.category).toBe(2);
    });

    it("clears only the dimension whose week selection is edited", () => {
        const {result} = renderHook(useCalendarIsolation);
        act(() => result.current.toggleCategory(2));
        act(() => result.current.toggleDevice("phone"));
        act(() => result.current.clearCategory());
        expect(result.current.category).toBeNull();
        expect(result.current.device).toBe("phone");
        act(() => result.current.clearDevice());
        expect(result.current.active).toBe(false);
    });
});
