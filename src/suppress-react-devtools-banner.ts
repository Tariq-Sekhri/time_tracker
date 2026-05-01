if (import.meta.env.DEV) {
    const patch = (method: "log" | "info") => {
        const orig = console[method].bind(console);
        (console as unknown as Record<string, typeof console.log>)[method] = (
            ...args: unknown[]
        ) => {
            if (
                typeof args[0] === "string" &&
                args[0].includes("Download the React DevTools")
            ) {
                return;
            }
            orig(...args);
        };
    };
    patch("log");
    patch("info");
}
