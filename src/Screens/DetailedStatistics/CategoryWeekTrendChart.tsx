import {useMemo} from "react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {WeekStatistics} from "../../api/statistics.ts";
import {formatDuration} from "../Calander/utils.ts";
import {adjustInstantToCalendarDayBoundary} from "../../utils.ts";

export type WeekTrendColumn = {
    week_start: number;
    label: string;
};

export type CategoryWeekSeries = {
    category: string;
    color: string;
    values: number[];
};

export type TrendValueMode = "avg" | "total";

const PX_PER_WEEK = 52;
const TOTAL_WEEK_DATA_KEY = "__week_total__";
const TOTAL_LINE_COLOR = "#f3f4f6";
const TOTAL_LINE_NAME = "Total";

function countDaysInTrackedWeekPeriod(
    weekStartUnix: number,
    weekEndUnix: number,
    calendarStartHour: number
): number {
    const nowUnix = Math.floor(Date.now() / 1000);
    const cappedEnd = Math.min(weekEndUnix, nowUnix);
    if (cappedEnd < weekStartUnix) return 1;
    const startCal = adjustInstantToCalendarDayBoundary(new Date(weekStartUnix * 1000), calendarStartHour);
    const endCal = adjustInstantToCalendarDayBoundary(new Date(cappedEnd * 1000), calendarStartHour);
    const startMid = new Date(
        startCal.getFullYear(),
        startCal.getMonth(),
        startCal.getDate(),
        12,
        0,
        0,
        0
    );
    const endMid = new Date(endCal.getFullYear(), endCal.getMonth(), endCal.getDate(), 12, 0, 0, 0);
    let n = 0;
    const cur = new Date(startMid);
    while (cur.getTime() <= endMid.getTime()) {
        n++;
        cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, n);
}

function formatWeekLabel(weekStartUnix: number): string {
    return new Date(weekStartUnix * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

function buildSeries(
    weeks: { week_start: number; week_end: number }[],
    weekStats: (WeekStatistics | undefined)[],
    mode: TrendValueMode,
    calendarStartHour: number
): { columns: WeekTrendColumn[]; series: CategoryWeekSeries[]; totalLineValues: number[] } {
    const columns: WeekTrendColumn[] = weeks.map((w) => ({
        week_start: w.week_start,
        label: formatWeekLabel(w.week_start),
    }));

    const categoryMeta = new Map<string, { color: string; values: number[] }>();

    weeks.forEach((weekRange, weekIdx) => {
        const stats = weekStats[weekIdx];
        const dayCount =
            mode === "avg"
                ? countDaysInTrackedWeekPeriod(
                      weekRange.week_start,
                      weekRange.week_end,
                      calendarStartHour
                  )
                : 1;
        const seen = new Set<string>();

        for (const cat of stats?.categories ?? []) {
            seen.add(cat.category);
            const value =
                mode === "avg"
                    ? Math.floor(cat.total_duration / dayCount)
                    : cat.total_duration;
            const existing = categoryMeta.get(cat.category);
            if (existing) {
                existing.values[weekIdx] = value;
                if (cat.color) existing.color = cat.color;
            } else {
                const values = new Array(weeks.length).fill(0);
                values[weekIdx] = value;
                categoryMeta.set(cat.category, {
                    color: cat.color || "#6b7280",
                    values,
                });
            }
        }

        for (const [name, entry] of categoryMeta) {
            if (!seen.has(name) && entry.values[weekIdx] === undefined) {
                entry.values[weekIdx] = 0;
            }
        }
    });

    const series: CategoryWeekSeries[] = Array.from(categoryMeta.entries())
        .map(([category, {color, values}]) => ({
            category,
            color,
            values,
        }))
        .filter((s) => s.values.some((v) => v > 0))
        .sort((a, b) => {
            const sumA = a.values.reduce((x, y) => x + y, 0);
            const sumB = b.values.reduce((x, y) => x + y, 0);
            return sumB - sumA;
        });

    const totalLineValues = weeks.map((weekRange, weekIdx) => {
        const weekTotal = weekStats[weekIdx]?.total_time ?? 0;
        if (mode === "total") return weekTotal;
        const dayCount = countDaysInTrackedWeekPeriod(
            weekRange.week_start,
            weekRange.week_end,
            calendarStartHour
        );
        return Math.floor(weekTotal / dayCount);
    });

    return {columns, series, totalLineValues};
}

type ChartRow = { label: string; week_start: number } & Record<string, number | string>;

type CategoryWeekTrendChartProps = {
    weeks: { week_start: number; week_end: number }[];
    weekStats: (WeekStatistics | undefined)[];
    isLoading: boolean;
    visibleCategoryNames: Set<string>;
    calendarStartHour: number;
    valueMode: TrendValueMode;
    showTotalLine: boolean;
};

export default function CategoryWeekTrendChart({
                                                   weeks,
                                                   weekStats,
                                                   isLoading,
                                                   visibleCategoryNames,
                                                   calendarStartHour,
                                                   valueMode,
                                                   showTotalLine,
                                               }: CategoryWeekTrendChartProps) {
    const {columns, series: allSeries, totalLineValues} = useMemo(
        () => buildSeries(weeks, weekStats, valueMode, calendarStartHour),
        [weeks, weekStats, valueMode, calendarStartHour]
    );

    const series = useMemo(
        () => allSeries.filter((s) => visibleCategoryNames.has(s.category)),
        [allSeries, visibleCategoryNames]
    );

    const hasTotalLineData = totalLineValues.some((v) => v > 0);

    const chartData: ChartRow[] = useMemo(() => {
        return columns.map((col, i) => {
            const row: ChartRow = {label: col.label, week_start: col.week_start};
            if (showTotalLine) {
                row[TOTAL_WEEK_DATA_KEY] = totalLineValues[i] ?? 0;
            }
            for (const s of series) {
                row[s.category] = s.values[i] ?? 0;
            }
            return row;
        });
    }, [columns, series, totalLineValues, showTotalLine]);

    const showTotalLineOnChart = showTotalLine && hasTotalLineData;

    const modeDescription =
        valueMode === "avg"
            ? showTotalLine
                ? "Daily average per week (week total ÷ calendar days in period). The Total line is your overall daily average for the week."
                : "Daily average per week (week total ÷ calendar days in period)."
            : showTotalLine
              ? "Sum of all tracked time in each week. The Total line is all categories combined for the week."
              : "Sum of all tracked time in each week.";

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
                {visibleCategoryNames.size === 0
                    ? "Select at least one category in the filter."
                    : "No category data for the selected weeks."}
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-gray-900 rounded p-4">
            <p className="text-sm text-gray-400 shrink-0 mb-3">{modeDescription}</p>
            <div
                className="flex flex-wrap gap-x-4 gap-y-2 mb-4 pb-4 border-b border-gray-800 shrink-0 max-h-28 overflow-y-auto nice-scrollbar">
                {showTotalLineOnChart && (
                    <div className="flex items-center gap-2 min-w-0">
                        <div
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-gray-500"
                            style={{backgroundColor: TOTAL_LINE_COLOR}}
                        />
                        <span className="text-xs text-gray-200 font-medium truncate">{TOTAL_LINE_NAME}</span>
                    </div>
                )}
                {series.map((s) => (
                    <div key={s.category} className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: s.color}}/>
                        <span className="text-xs text-gray-300 truncate">{s.category}</span>
                    </div>
                ))}
            </div>
            <div className="flex-1 min-h-[280px] min-w-0 overflow-x-auto overflow-y-hidden nice-scrollbar rounded">
                <div
                    className="h-[min(520px,calc(100vh-22rem))] min-h-[260px]"
                    style={{width: `max(100%, ${columns.length * PX_PER_WEEK}px)`}}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={chartData}
                            margin={{top: 10, right: 16, bottom: 8, left: 8}}
                            style={{outline: "none"}}
                        >
                            <CartesianGrid stroke="#374151" strokeDasharray="6 6" vertical={false}/>
                            <XAxis
                                dataKey="label"
                                tick={{fill: "#9ca3af", fontSize: 11}}
                                tickLine={false}
                                axisLine={{stroke: "#4b5563"}}
                            />
                            <YAxis
                                tick={{fill: "#9ca3af", fontSize: 11}}
                                tickFormatter={(sec) =>
                                    typeof sec === "number" ? formatDuration(sec) : String(sec)
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
                                            ? formatDuration(Math.round(value))
                                            : String(value ?? "");
                                    return [formatted, label];
                                }}
                                labelFormatter={(label) => (label != null ? String(label) : "")}
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
                            {series.map((s) => (
                                <Line
                                    key={s.category}
                                    type="monotone"
                                    dataKey={s.category}
                                    name={s.category}
                                    stroke={s.color}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{r: 5}}
                                    connectNulls
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
