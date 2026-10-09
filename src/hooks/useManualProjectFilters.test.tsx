// @vitest-environment jsdom
import {act, renderHook, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {getAppMetadata, setAppMetadata} from "../api/appMetadata.ts";
import {useManualProjectFilters} from "./useManualProjectFilters.ts";

vi.mock("../api/appMetadata.ts", () => ({getAppMetadata: vi.fn(), setAppMetadata: vi.fn()}));

describe("manual project filters", () => {
    beforeEach(() => {
        vi.mocked(getAppMetadata).mockResolvedValue(null);
        vi.mocked(setAppMetadata).mockResolvedValue();
        vi.clearAllMocks();
    });

    it("saves independent week/stats choices for a project and No project", async () => {
        const {result, unmount} = renderHook(() => useManualProjectFilters(true, true));
        await waitFor(() => expect(result.current.manualProjectFiltersLoaded).toBe(true));
        act(() => result.current.toggleManualTimeInCal(7));
        expect(result.current.isManualTimeInCal(7)).toBe(false);
        expect(result.current.isManualTimeInStats(7)).toBe(true);
        expect(result.current.isManualTimeInCal(null)).toBe(true);
        expect(result.current.isManualTimeInCal(8)).toBe(true);
        act(() => result.current.toggleManualTimeInStats(null));
        expect(result.current.isManualTimeInStats(undefined)).toBe(false);
        expect(result.current.isManualTimeInStats(7)).toBe(true);
        const calls = vi.mocked(setAppMetadata).mock.calls;
        const saved = calls[calls.length - 1][1];
        unmount();
        vi.mocked(getAppMetadata).mockResolvedValue(saved);
        const restored = renderHook(() => useManualProjectFilters(true, true));
        await waitFor(() => expect(restored.result.current.manualProjectFiltersLoaded).toBe(true));
        expect(restored.result.current.isManualTimeInCal(7)).toBe(false);
        expect(restored.result.current.isManualTimeInStats(null)).toBe(false);
        expect(restored.result.current.isManualTimeInStats(7)).toBe(true);
        restored.unmount();
    });

    it("bulk toggles both existing and future projects independently for week and stats", async () => {
        const {result, unmount} = renderHook(() => useManualProjectFilters(true, true));
        await waitFor(() => expect(result.current.manualProjectFiltersLoaded).toBe(true));
        act(() => result.current.toggleAllManualTimeInCal([null, 7, 8]));
        for (const id of [null, 7, 8, 9]) {
            expect(result.current.isManualTimeInCal(id)).toBe(false);
            expect(result.current.isManualTimeInStats(id)).toBe(true);
        }
        act(() => result.current.toggleManualTimeInCal(7));
        act(() => result.current.toggleAllManualTimeInCal([null, 7, 8]));
        for (const id of [null, 7, 8, 9]) expect(result.current.isManualTimeInCal(id)).toBe(true);
        act(() => result.current.toggleAllManualTimeInStats([null, 7, 8]));
        expect(result.current.isManualTimeInStats(7)).toBe(false);
        expect(result.current.isManualTimeInCal(7)).toBe(true);
        unmount();
    });

    it("isolates even a hidden project, switches projects, then restores saved week choices", async () => {
        const {result, unmount} = renderHook(() => useManualProjectFilters(true, true));
        await waitFor(() => expect(result.current.manualProjectFiltersLoaded).toBe(true));
        act(() => result.current.toggleManualTimeInCal(7));
        const writesBeforeIsolation = vi.mocked(setAppMetadata).mock.calls.length;
        act(() => result.current.toggleIsolateProject(7));
        expect(result.current.isManualTimeInCal(7)).toBe(true);
        expect(result.current.isManualTimeInCal(8)).toBe(false);
        expect(result.current.isManualTimeInCal(null)).toBe(false);
        expect(result.current.isManualTimeInStats(8)).toBe(true);
        act(() => result.current.toggleIsolateProject(null));
        expect(result.current.isManualTimeInCal(null)).toBe(true);
        expect(result.current.isManualTimeInCal(7)).toBe(false);
        act(() => result.current.toggleIsolateProject(null));
        expect(result.current.isolatedProject).toBeNull();
        expect(result.current.isManualTimeInCal(7)).toBe(false);
        expect(result.current.isManualTimeInCal(8)).toBe(true);
        expect(result.current.isManualTimeInCal(null)).toBe(true);
        expect(vi.mocked(setAppMetadata).mock.calls.length).toBe(writesBeforeIsolation);
        unmount();
    });

    it("preserves legacy defaults and enables new projects independently", async () => {
        const {result, unmount} = renderHook(() => useManualProjectFilters(false, false));
        await waitFor(() => expect(result.current.manualProjectFiltersLoaded).toBe(true));
        expect(result.current.isManualTimeInCal(null)).toBe(false);
        expect(result.current.isManualTimeInStats(7)).toBe(false);
        act(() => result.current.toggleManualTimeInStats(7));
        expect(result.current.isManualTimeInStats(7)).toBe(true);
        expect(result.current.isManualTimeInStats(8)).toBe(false);
        expect(result.current.isManualTimeInCal(7)).toBe(false);
        unmount();
    });
});
