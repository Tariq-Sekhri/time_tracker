// Installed by Tauri before the frontend bundle, including failed bundle loads.
(() => {
    const write = (message) => {
        if (window.__TIME_TRACKER_DIAGNOSTICS__) return;
        try {
            window.__TAURI_INTERNALS__.invoke("log_frontend", {level: "error", message})
                .catch(() => {}); // The logger cannot use itself to report a bridge failure.
        } catch (_) {}
    };
    window.addEventListener("error", (event) => {
        if (event.error) write(`Early JavaScript error: ${event.error.stack || event.message}`);
        else if (event.message) write(`Early JavaScript error: ${event.message} ${event.filename}:${event.lineno}`);
        else write(`Early resource load failed: ${event.target?.src || event.target?.href || "unknown"}`);
    }, true);
    window.addEventListener("unhandledrejection", (event) => {
        write(`Early unhandled promise rejection: ${event.reason?.stack || String(event.reason)}`);
    });
})();
