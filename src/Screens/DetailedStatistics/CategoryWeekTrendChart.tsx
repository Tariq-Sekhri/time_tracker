import {memo, useMemo} from "react";
import {measure} from "../../perf.ts";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    useXAxisScale,
    useYAxisScale,
} from "recharts";
import {TrendWeekStatistics} from "../../api/statistics.ts";
import {formatDuration} from "../Calander/utils.ts";
import {buildSeries, buildTopAppSeries} from "./trendModel.ts";

export type WeekTrendColumn = {
    week_start: number;
    label: string;
};

export type CategoryWeekSeries = {
    category: string;
    color: string;
    values: Array<number | null>;
};

export type TrendValueMode = "avg" | "total";
export type TrendSeriesMode = "categories" | "topApps";
export type TrendAppRanking = "weekly" | "range";

const TOTAL_WEEK_DATA_KEY = "__week_total__";
const WEEK_INDEX_DATA_KEY = "__week_index__";
const TOTAL_LINE_COLOR = "#f3f4f6";
const TOTAL_LINE_NAME = "Total";

type ChartRow = { label: string; week_start: number } & Record<string, number | string | null>;

export type TrendGapBridge = {
    dataKey: string;
    fromIndex: number;
    fromValue: number;
    toIndex: number;
    toValue: number;
    color: string;
};

/** Straight gap connectors share a tiny SVG layer instead of each mounting a Recharts Line/store subscription. */
export function TrendGapPaths({bridges}: {bridges: TrendGapBridge[]}) {
    const xScale = useXAxisScale();
    const yScale = useYAxisScale();
    const paths = useMemo(() => {
        const byColor = new Map<string, string[]>();
        if (!xScale || !yScale) return byColor;
        for (const bridge of bridges) {
            const x1 = xScale(bridge.fromIndex);
            const x2 = xScale(bridge.toIndex);
            const y1 = yScale(bridge.fromValue);
            const y2 = yScale(bridge.toValue);
            if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
            let segments = byColor.get(bridge.color);
            if (!segments) byColor.set(bridge.color, segments = []);
            segments.push(`M${x1},${y1}L${x2},${y2}`);
        }
        return byColor;
    }, [bridges, xScale, yScale]);
    return <g className="trend-gap-bridges" pointerEvents="none">
        {[...paths].map(([color, segments]) => <path key={color} d={segments.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 4" />)}
    </g>;
}

type CategoryWeekTrendChartProps = {
    weeks: { week_start: number; week_end: number }[];
    weekStats: (TrendWeekStatistics | undefined)[];
    isLoading: boolean;
    visibleCategoryNames: Set<string>;
    seriesMode: TrendSeriesMode;
    topAppCount: number;
    appRanking?: TrendAppRanking;
    calendarStartHour: number;
    valueMode: TrendValueMode;
    showTotalLine: boolean;
    error?: string;
};

function CategoryWeekTrendChart({
                                                   weeks,
                                                   weekStats,
                                                   isLoading,
                                                   visibleCategoryNames,
                                                   seriesMode,
                                                   topAppCount,
                                                   appRanking = "weekly",
                                                   calendarStartHour,
                                                   valueMode,
                                                   showTotalLine,
                                                   error,
                                               }: CategoryWeekTrendChartProps) {
    const {columns, series: allSeries, totalLineValues} = useMemo(
        () => measure(`trend.build_${seriesMode}`, () =>
            seriesMode === "topApps"
                ? buildTopAppSeries(weeks, weekStats, "avg", calendarStartHour, topAppCount, appRanking)
                : buildSeries(weeks, weekStats, "avg", calendarStartHour),
            (r) => ({weeks: weeks.length, loaded: weekStats.filter(Boolean).length, series: r.series.length})),
        [weeks, weekStats, calendarStartHour, seriesMode, topAppCount, appRanking]
    );

    // The batched query and category filter both keep stable references across unrelated renders.
    const series = useMemo(
        () => measure("trend.filter_series", () =>
            seriesMode === "topApps"
                ? allSeries
                : allSeries.filter((s) => visibleCategoryNames.has(s.category)),
            (r) => ({series: r.length})),
        [allSeries, visibleCategoryNames, seriesMode]
    );

    const hasTotalLineData = totalLineValues.some((v) => v > 0);

    const topAppGapBridges = useMemo<TrendGapBridge[]>(() => measure("trend.gap_bridges", () => {
        if (seriesMode !== "topApps" || appRanking !== "weekly") return [];

        return series.flatMap((s) => {
            const bridges: TrendGapBridge[] = [];
            let previousIndex: number | null = null;

            s.values.forEach((value, index) => {
                if (value == null) return;
                if (previousIndex !== null && index - previousIndex > 1) {
                    bridges.push({
                        dataKey: `__top_app_gap__${s.category}:${previousIndex}:${index}`,
                        fromIndex: previousIndex,
                        fromValue: s.values[previousIndex]!,
                        toIndex: index,
                        toValue: value,
                        color: s.color,
                    });
                }
                previousIndex = index;
            });

            return bridges;
        });
    }, (r) => ({bridges: r.length})), [series, seriesMode, appRanking]);

    const chartData: ChartRow[] = useMemo(() => measure("trend.chart_data", () => {
        return columns.map((col, i) => {
            const row: ChartRow = {label: col.label, week_start: col.week_start, [WEEK_INDEX_DATA_KEY]: i};
            if (showTotalLine) {
                row[TOTAL_WEEK_DATA_KEY] = totalLineValues[i] ?? 0;
            }
            for (const s of series) {
                row[s.category] = seriesMode === "topApps" ? s.values[i] : s.values[i] ?? 0;
            }

            return row;
        });
    }, (r) => ({rows: r.length, series: series.length})), [columns, series, totalLineValues, showTotalLine, seriesMode]);

    const showTotalLineOnChart = showTotalLine && hasTotalLineData;
    // Keep coordinates and automatic axis ticks identical; only display units change.
    const displayScale = valueMode === "total" ? 7 : 1;

    const modeDescription =
        valueMode === "avg"
            ? showTotalLine
                ? "Per-day average each week. Total line = overall daily average."
                : "Per-day average each week."
            : showTotalLine
              ? "Week totals, normalized to 7 days for incomplete weeks. Total line = all categories combined."
              : "Week totals, normalized to 7 days for incomplete weeks.";
    const seriesDescription =
        seriesMode === "topApps"
            ? appRanking === "range"
                ? ` Showing the top ${topAppCount} apps by total time across the selected range, with every week included.`
                : ` Showing the top ${topAppCount} apps in each week; solid lines join consecutive appearances, while dotted lines bridge weeks where an app was outside the top ${topAppCount}.`
            : "";

    if (error) return <div role="alert" className="p-4 text-sm text-red-400">{error}</div>;

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[320px] text-gray-500 text-sm">
                Loading week trends...
            </div>
        );
    }

    if (weeks.length === 0) {
        return (
            <div
                className="flex-1 flex items-center justify-center min-h-[320px] text-gray-500 text-sm text-center px-4">
                Select a date range that includes at least one week.
            </div>
        );
    }

    if (series.length === 0 && !showTotalLineOnChart) {
        return (
            <div
                className="flex-1 flex items-center justify-center min-h-[320px] text-gray-500 text-sm text-center px-4">
                {seriesMode === "categories" && visibleCategoryNames.size === 0
                    ? "Select at least one category in the filter."
                    : `No ${seriesMode === "topApps" ? "app" : "category"} data for the selected weeks.`}
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-gray-900 rounded p-3">
            <p className="text-sm text-gray-400 shrink-0 mb-2">{modeDescription}{seriesDescription}</p>
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden rounded">
                <div
                    className="flex-1 min-h-0 min-w-0 w-full"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={chartData}
                            margin={{top: 10, right: 16, bottom: 8, left: 8}}
                            style={{outline: "none"}}
                        >
                            <CartesianGrid stroke="#374151" strokeDasharray="6 6" vertical={false}/>
                            <XAxis
                                dataKey={WEEK_INDEX_DATA_KEY}
                                tickFormatter={(index) => columns[Number(index)]?.label ?? ""}
                                interval="preserveStartEnd"
                                minTickGap={16}
                                tick={{fill: "#9ca3af", fontSize: 11}}
                                tickLine={false}
                                axisLine={{stroke: "#4b5563"}}
                            />
                            <YAxis
                                tick={{fill: "#9ca3af", fontSize: 11}}
                                tickFormatter={(sec) =>
                                    typeof sec === "number" ? formatDuration(Math.round(sec * displayScale)) : String(sec)
                                }
                                tickLine={false}
                                axisLine={{stroke: "#4b5563"}}
                                width={72}
                                domain={[0, "auto"]}
                            />
                            <Tooltip
                                cursor={{stroke: "#6b7280", strokeWidth: 1, strokeDasharray: "4 4"}}
                                contentStyle={{
                                    backgroundColor: "#111827",
                                    border: "1px solid #374151",
                                    borderRadius: "8px",
                                    color: "#e5e7eb",
                                    fontSize: "12px",
                                }}
                                formatter={(value, name) => {
                                    const label =
                                        name === TOTAL_WEEK_DATA_KEY || name === TOTAL_LINE_NAME
                                            ? TOTAL_LINE_NAME
                                            : String(name ?? "");
                                    const formatted =
                                        typeof value === "number"
                                            ? formatDuration(Math.round(value * displayScale))
                                            : String(value ?? "");
                                    return [formatted, label];
                                }}
                                labelFormatter={(index) => columns[Number(index)]?.label ?? ""}
                                itemSorter={(a) => {
                                    if (a?.dataKey === TOTAL_WEEK_DATA_KEY || a?.name === TOTAL_LINE_NAME) {
                                        return Number.MIN_SAFE_INTEGER;
                                    }
                                    return -(typeof a?.value === "number" ? a.value : Number(a?.value ?? 0));
                                }}
                            />
                            {showTotalLineOnChart && (
                                <Line
                                    type="monotone"
                                    dataKey={TOTAL_WEEK_DATA_KEY}
                                    name={TOTAL_LINE_NAME}
                                    stroke={TOTAL_LINE_COLOR}
                                    strokeWidth={2.5}
                                    strokeDasharray="6 4"
                                    dot={{r: 4, fill: TOTAL_LINE_COLOR, strokeWidth: 0}}
                                    activeDot={{r: 6}}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            )}
                            <TrendGapPaths bridges={topAppGapBridges} />
                            {series.map((s) => (
                                <Line
                                    key={s.category}
                                    type="monotone"
                                    dataKey={s.category}
                                    name={s.category}
                                    stroke={s.color}
                                    strokeWidth={2}
                                    dot={
                                        seriesMode === "topApps"
                                            ? {r: 3, fill: s.color, strokeWidth: 0}
                                            : false
                                    }
                                    activeDot={{r: 5}}
                                    connectNulls={false}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

export default memo(CategoryWeekTrendChart);
