import {invoke} from "@tauri-apps/api/core";

export type LogLevel = "info" | "debug" | "warn" | "error";
const originalConsoleError = console.error.bind(console);
let loggingFailureReported = false;
let installed = false;

export function describeError(value: unknown): string {
    const seen = new WeakSet<object>();
    try {
        if (typeof value === "string") return value;
        return JSON.stringify(value, (key, item: unknown) => {
            if (/token|secret|password|authorization/i.test(key)) return "[REDACTED]";
            if (item && typeof item === "object") {
                if (seen.has(item)) return "[Circular]";
                seen.add(item);
                if (item instanceof Error) {
                    return {name: item.name, message: item.message, stack: item.stack,
                        cause: (item as Error & {cause?: unknown}).cause};
                }
            }
            return item;
        }) ?? String(value);
    } catch { return "[Unserializable error]"; }
}

export async function logMessage(level: LogLevel, message: string): Promise<void> {
    if (!isDesktopApp()) return;
    try {
        await invoke("log_frontend", {level, message});
    } catch (error) {
        // Never recurse through the patched console or reject app operations if logging fails.
        if (!loggingFailureReported) {
            loggingFailureReported = true;
            originalConsoleError("Support logging unavailable", error);
        }
    }
}

export function isDesktopApp(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function reportError(context: string, error: unknown): Promise<void> {
    return logMessage("error", `${context}: ${describeError(error)}`);
}

export function installDiagnostics(): void {
    if (installed) return;
    installed = true;
    (window as Window & {__TIME_TRACKER_DIAGNOSTICS__?: boolean}).__TIME_TRACKER_DIAGNOSTICS__ = true;
    for (const method of ["error", "warn", "info", "log", "debug"] as const) {
        const original = console[method].bind(console);
        console[method] = (...args: unknown[]) => {
            original(...args);
            const level = method === "log" ? "info" : method;
            void logMessage(level, `console.${method}: ${args.map(describeError).join(" ")}`);
        };
    }
    window.addEventListener("error", (event: Event) => {
        if (event instanceof ErrorEvent) {
            void reportError(`JavaScript error ${event.filename}:${event.lineno}:${event.colno}`, event.error ?? event.message);
        } else {
            const target = event.target as HTMLElement | null;
            const url = target?.getAttribute?.("src") ?? target?.getAttribute?.("href") ?? "unknown";
            void logMessage("error", `Resource failed to load: ${target?.tagName ?? "unknown"} ${url}`);
        }
    }, true);
    window.addEventListener("unhandledrejection", (event) => {
        void reportError("Unhandled promise rejection", event.reason);
    });
    window.addEventListener("pagehide", () => { void logMessage("info", "Frontend page hidden/unloaded"); });
    void logMessage("info", `Frontend starting user_agent=${navigator.userAgent}`);
}

/** Describe operations without copying notes, credentials, or calendar content. */
function operationDetails(args?: Record<string, unknown>): string {
    if (!args) return "";
    const summary: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
        if (/token|secret|password|authorization|clientId/i.test(key)) continue;
        if (typeof value === "number" || typeof value === "boolean" || value == null) summary[key] = value;
        else if (key === "key" && typeof value === "string") summary[key] = value;
        else if (Array.isArray(value)) summary[`${key}Count`] = value.length;
        else if (typeof value === "object") summary[`${key}Fields`] = Object.keys(value);
        else summary[`${key}Length`] = String(value).length;
    }
    return ` ${JSON.stringify(summary)}`;
}

let operationId = 0;
export async function invokeLogged<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const id = ++operationId;
    const started = performance.now();
    const level = /^(get_|list_|count_|check)/.test(command) ? "debug" : "info";
    await logMessage(level, `Operation #${id} ${command} started${operationDetails(args)}`);
    try {
        const result = await invoke<T>(command, args);
        const summary = Array.isArray(result) ? ` rows=${result.length}` : "";
        await logMessage(level, `Operation #${id} ${command} completed elapsed_ms=${Math.round(performance.now() - started)}${summary}`);
        return result;
    } catch (error) {
        await reportError(`Operation #${id} ${command} failed elapsed_ms=${Math.round(performance.now() - started)}`, error);
        throw error;
    }
}

export type SupportLogInfo = {path: string; directory: string; available: boolean};
export function getSupportLogInfo(): Promise<SupportLogInfo> { return invokeLogged("get_support_log_info"); }
export function openSupportLogFolder(): Promise<void> { return invokeLogged("open_support_log_folder"); }
