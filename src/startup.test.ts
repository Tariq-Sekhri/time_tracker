import {afterEach, describe, expect, it, vi} from "vitest";
import {retryStartupDatabase} from "./startup";

vi.mock("./diagnostics", () => ({
    describeError: (error: unknown) => error instanceof Error ? error.message : String(error),
    logMessage: vi.fn(),
}));

afterEach(() => vi.useRealTimers());

describe("startup database recovery", () => {
    it("recovers when a boot-time lock clears", async () => {
        vi.useFakeTimers();
        const operation = vi.fn()
            .mockRejectedValueOnce("error returned from database: database is locked")
            .mockRejectedValueOnce(new Error("pool timed out while waiting for an open connection"))
            .mockResolvedValue(undefined);
        const result = retryStartupDatabase(operation);
        await vi.runAllTimersAsync();
        await result;
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it("stops after three attempts if the lock persists", async () => {
        vi.useFakeTimers();
        const operation = vi.fn().mockRejectedValue("database is locked");
        const result = expect(retryStartupDatabase(operation)).rejects.toBe("database is locked");
        await vi.runAllTimersAsync();
        await result;
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it("reports non-transient errors immediately", async () => {
        const operation = vi.fn().mockRejectedValue("database disk image is malformed");
        await expect(retryStartupDatabase(operation)).rejects.toBe("database disk image is malformed");
        expect(operation).toHaveBeenCalledTimes(1);
    });
});
