/* @vitest-environment jsdom */
import {afterEach, describe, expect, it, vi} from "vitest";
import {observePaint} from "./perf.ts";

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("paint telemetry", () => {
    it("does not wait for paused animation frames while hidden", async () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        const frame = vi.spyOn(window, "requestAnimationFrame");
        expect(await observePaint()).toMatchObject({observed: false, reason: "hidden"});
        expect(frame).not.toHaveBeenCalled();
    });

    it("marks the timestamp as observed only after both frames complete", async () => {
        vi.useFakeTimers();
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        const result = observePaint();
        await vi.advanceTimersByTimeAsync(50);
        expect(await result).toMatchObject({observed: true});
    });

    it("bounds stalled visible paint callbacks and labels the timing unobserved", async () => {
        vi.useFakeTimers();
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        vi.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
        const result = observePaint();
        await vi.advanceTimersByTimeAsync(1000);
        expect(await result).toMatchObject({observed: false, reason: "timeout"});
    });

    it("ends a pending paint when the window becomes hidden", async () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        vi.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
        const result = observePaint();
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        expect(await result).toMatchObject({observed: false, reason: "hidden"});
    });
});
