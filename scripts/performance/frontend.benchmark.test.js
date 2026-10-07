import {it, expect} from "vitest";
import {execFileSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import ts from "typescript";
import {buildSeries, buildTopAppSeries} from "../../src/Screens/DetailedStatistics/trendModel.ts";
import {adjustInstantToCalendarDayBoundary} from "../../src/utils.ts";

const baseline = "2c2c7706d6633aefbd3759a19640dbfdb22f6d05";
const run = process.env.RUN_FRONTEND_BENCHMARK === "1" ? it : it.skip;
run("compares original and optimized trend computations on synthetic data", () => {
    const original = execFileSync("git", ["show", `${baseline}:src/Screens/DetailedStatistics/CategoryWeekTrendChart.tsx`], {encoding: "utf8"});
    const body = original.slice(original.indexOf("const APP_LINE_COLORS"), original.indexOf("type ChartRow"));
    const compiled = ts.transpileModule(body, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
    const old = Function("adjustInstantToCalendarDayBoundary", compiled + "; return {buildSeries, buildTopAppSeries};")(adjustInstantToCalendarDayBoundary);
    const weeks = Array.from({length: 24}, (_, i) => ({week_start: 1700000000 + i * 604800, week_end: 1700000000 + (i + 1) * 604800 - 1}));
    const stats = weeks.map((_, i) => ({
        total_time: 500000,
        categories: Array.from({length: 30}, (_, j) => ({category: "Category " + j, color: "#aaa", total_duration: 500 + j * 10 + i, percentage: 0, percentage_change: null})),
        all_apps: Array.from({length: 1000}, (_, j) => ({app: "App " + j, total_duration: (j * 97 + i * 113) % 9000, app_names: ["Window " + j], percentage_change: null})),
    }));
    const results = [];
    for (const [name, after] of [["buildSeries", buildSeries], ["buildTopAppSeries", buildTopAppSeries]]) {
        const before = old[name];
        const clean = model => ({columns: model.columns, totalLineValues: model.totalLineValues, series: model.series.map(({category, color, values}) => ({category, color, values}))});
        expect(clean(after(weeks, stats, "total", 4, 20))).toEqual(clean(before(weeks, stats, "total", 4, 20)));
        const times = [];
        for (const fn of [before, after]) {
            for (let i = 0; i < 10; i++) fn(weeks, stats, "total", 4, 20);
            const started = performance.now();
            for (let i = 0; i < 200; i++) fn(weeks, stats, "total", 4, 20);
            times.push((performance.now() - started) / 200);
        }
        results.push({name, before_ms: times[0], after_ms: times[1], reduction_percent: (1 - times[1] / times[0]) * 100});
    }
    const report = {baseline_commit: baseline, fixture: {weeks: 24, categories: 30, apps_per_week: 1000, top_app_count: 20, repetitions: 200, warmup: 10}, results};
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    writeFileSync("docs/performance/frontend-series.json", JSON.stringify(report, null, 2) + "\n");
});
