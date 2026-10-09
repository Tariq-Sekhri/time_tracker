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
