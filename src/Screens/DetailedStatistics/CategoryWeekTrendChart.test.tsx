/* @vitest-environment jsdom */
import {cleanup, render} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import CategoryWeekTrendChart, {TrendGapPaths, type TrendGapBridge} from "./CategoryWeekTrendChart.tsx";
import {buildSeries} from "./trendModel.ts";

vi.mock("./trendModel.ts", async (importOriginal) => {
    const original = await importOriginal<typeof import("./trendModel.ts")>();
    return {...original, buildSeries: vi.fn(original.buildSeries)};
});
vi.mock("recharts", () => ({
    CartesianGrid: () => null, Line: () => null, LineChart: () => null,
    ResponsiveContainer: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
    useXAxisTicks: () => [{coordinate: 10}, {coordinate: 30}, {coordinate: 50}, {coordinate: 70}],
    useYAxisScale: () => (value: number) => 200 - value,
}));
vi.mock("../../Componants/AppTitleDetails.tsx", () => ({default: () => null}));
afterEach(() => {cleanup(); vi.clearAllMocks();});

describe("trend rendering", () => {
    it("groups gaps into paths while preserving their exact straight endpoints and dash style", () => {
        const bridges: TrendGapBridge[] = [
            {dataKey: "a", fromIndex: 0, fromValue: 20, toIndex: 2, toValue: 40, color: "#red"},
            {dataKey: "b", fromIndex: 1, fromValue: 60, toIndex: 3, toValue: 80, color: "#red"},
            {dataKey: "c", fromIndex: 0, fromValue: 10, toIndex: 3, toValue: 50, color: "#blue"},
        ];
        const {container} = render(<svg><TrendGapPaths bridges={bridges} /></svg>);
        const paths = container.querySelectorAll("path");
        expect(paths).toHaveLength(2);
        expect(paths[0].getAttribute("d")).toBe("M10,180L50,160 M30,140L70,120");
        expect(paths[1].getAttribute("d")).toBe("M10,190L70,150");
        expect(paths[0].getAttribute("stroke-dasharray")).toBe("4 4");
        expect(container.querySelector("g")?.getAttribute("pointer-events")).toBe("none");
    });

    it("does not rebuild the chart when its parent rerenders with unchanged inputs", () => {
        const props = {weeks: [{week_start: 100, week_end: 200}], weekStats: [{total_time: 100, categories: [{category: "Work", total_duration: 100, color: "red", percentage: 100, percentage_change: null}], all_apps: []}], isLoading: false, visibleCategoryNames: new Set(["Work"]), seriesMode: "categories" as const, topAppCount: 5, calendarStartHour: 4, valueMode: "total" as const, showTotalLine: true};
        const {rerender} = render(<CategoryWeekTrendChart {...props} />);
        expect(buildSeries).toHaveBeenCalledTimes(1);
        rerender(<CategoryWeekTrendChart {...props} />);
        expect(buildSeries).toHaveBeenCalledTimes(1);
        rerender(<CategoryWeekTrendChart {...props} valueMode="avg" />);
        expect(buildSeries).toHaveBeenCalledTimes(1);
        expect(buildSeries).toHaveBeenCalledWith(props.weeks, props.weekStats, "avg", 4);
    });
});
