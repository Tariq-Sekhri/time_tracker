import type {QueryClient} from "@tanstack/react-query";
import {invoke} from "@tauri-apps/api/core";
import {logMessage} from "./diagnostics";

/** Opt-in native dev scenario. Never loaded by the production build. */
export async function runDevPerformanceScenario(client: QueryClient): Promise<void> {
    const path = await invoke<string>("get_db_path_cmd");
    if (!path.includes("time-tracker-dev") || !path.endsWith("apptest.db")) {
        throw new Error("Performance scenario requires the isolated development database");
    }
    const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const wait = async (ready: () => boolean) => {
        const deadline = performance.now() + 120_000;
        while (!ready()) {
            if (performance.now() > deadline) throw new Error("Performance scenario timed out");
            await pause(50);
        }
    };
    const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find(item => item.textContent?.trim() === label);
    const paint = async () => {
        const {observePaint} = await import("./perf");
        const result = await observePaint();
        if (!result.observed) throw new Error(`Cannot measure native UI paint: ${result.reason}`);
    };
    await wait(() => !!button("Detailed") && client.isFetching() === 0);
    await pause(500);
    const samples: {area: string; ms: number; queries: number}[] = [];
    const gapChecks: {paths: number; segments: number; finite: boolean}[] = [];
    for (let iteration = 0; iteration < 3; iteration++) {
        for (const prefix of ["week_statistics", "total_statistics", "range_statistics"]) {
            client.removeQueries({queryKey: [prefix], exact: false});
        }
        let started = performance.now();
        button("Detailed")!.click();
        await wait(() => !!button("Trend") && client.isFetching() === 0 &&
            client.getQueryCache().findAll({queryKey: ["range_statistics"]}).some(query => query.state.status === "success"));
        await paint();
        samples.push({area: "detailed_open", ms: performance.now() - started, queries: client.getQueryCache().getAll().length});
        started = performance.now();
        button("Trend")!.click();
        await wait(() => client.getQueryCache().findAll({queryKey: ["week_statistics", "trend"]}).some(query => query.state.status === "success") && client.isFetching() === 0);
        await paint();
        samples.push({area: "trend_open", ms: performance.now() - started, queries: client.getQueryCache().findAll({queryKey: ["week_statistics", "trend"]}).length});
        button("Top apps")!.click();
        await pause(100);
        await paint();
        const paths = Array.from(document.querySelectorAll<SVGPathElement>("g.trend-gap-bridges > path"));
        gapChecks.push({paths: paths.length,
            segments: paths.reduce((count, path) => count + (path.getAttribute("d")?.match(/M/g)?.length ?? 0), 0),
            finite: paths.every(path => !/NaN|Infinity/.test(path.getAttribute("d") ?? ""))});
        button("Categories")!.click();
        await pause(300);
        button("Calendar")!.click();
        await wait(() => !button("Trend") && client.isFetching() === 0);
        await paint();
    }
    await logMessage("info", `DEV_UI_BENCHMARK=${JSON.stringify({path, visible: document.visibilityState === "visible", samples, gapChecks})}`);
}
