/* @vitest-environment jsdom */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const bridge = vi.hoisted(() => ({invoke: vi.fn()}));
vi.mock("@tauri-apps/api/core", () => ({invoke: bridge.invoke}));
import {describeError, installDiagnostics, invokeLogged} from "./diagnostics";

beforeEach(() => {
    bridge.invoke.mockReset();
    bridge.invoke.mockResolvedValue(undefined);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {value: {}, configurable: true});
});
afterEach(() => vi.restoreAllMocks());
const messages = () => bridge.invoke.mock.calls.filter(([command]) => command === "log_frontend").map(([, args]) => args.message as string);

describe("support diagnostics", () => {
    it("persists the start before dispatch, records completion, and omits private contents", async () => {
        bridge.invoke.mockImplementation(async (command) => command === "set_notes_text" ? "saved" : undefined);
        await expect(invokeLogged("set_notes_text", {text: "private note", clientSecret: "private credential", enabled: true})).resolves.toBe("saved");
        expect(bridge.invoke.mock.calls.map(([command]) => command)).toEqual(["log_frontend", "set_notes_text", "log_frontend"]);
        expect(messages().join(" ")).toContain("completed");
        expect(messages().join(" ")).not.toContain("private note");
        expect(messages().join(" ")).not.toContain("private credential");
    });
    it("logs a caught IPC error with its stack and rethrows the original error", async () => {
        const failure = new Error("simulated settings failure");
        bridge.invoke.mockImplementation(async (command) => {
            if (command === "get_settings") throw failure;
        });
        await expect(invokeLogged("get_settings")).rejects.toBe(failure);
        expect(messages().join(" ")).toContain("get_settings failed");
        expect(messages().join(" ")).toContain("simulated settings failure");
        expect(messages().join(" ")).toContain("stack");
    });
    it("a failed logger cannot prevent or reject the user's operation", async () => {
        bridge.invoke.mockImplementation(async (command) => {
            if (command === "log_frontend") throw new Error("logger unavailable");
            return 42;
        });
        await expect(invokeLogged("get_settings")).resolves.toBe(42);
        expect(bridge.invoke).toHaveBeenCalledTimes(3);
    });
    it("captures console warnings, uncaught errors and rejected promises", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        installDiagnostics();
        console.warn("small warning");
        window.dispatchEvent(new ErrorEvent("error", {error: new Error("uncaught failure"), filename: "app.js", lineno: 12}));
        const rejected = new Event("unhandledrejection");
        Object.defineProperty(rejected, "reason", {value: new Error("rejected failure")});
        window.dispatchEvent(rejected);
        await Promise.resolve();
        const log = messages().join(" ");
        expect(log).toContain("small warning");
        expect(log).toContain("uncaught failure");
        expect(log).toContain("app.js:12");
        expect(log).toContain("rejected failure");
    });
    it("keeps error causes and handles circular error metadata", () => {
        const failure = new Error("outer") as Error & {cause?: unknown};
        failure.cause = {token: "private token", original: new Error("inner")};
        const text = describeError(failure);
        expect(text).toContain("outer");
        expect(text).toContain("inner");
        expect(text).not.toContain("private token");
        expect(text).toContain("[REDACTED]");
        const circular: {self?: unknown} = {};
        circular.self = circular;
        expect(describeError(circular)).toContain("[Circular]");
    });
});
