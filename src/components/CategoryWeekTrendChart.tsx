import { useMemo } from "react";
import { WeekStatistics } from "../api/statistics.ts";
import { formatDuration } from "../Screens/Calander/utils.ts";

export type WeekTrendColumn = {
    week_start: number;
    label: string;
};

export type CategoryWeekSeries = {
    category: string;
    color: string;
    dailyAvgSeconds: number[];
};

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 520;
const PLOT_LEFT = 64;
const PLOT_RIGHT = VIEW_WIDTH - 32;
const PLOT_TOP = 28;
const PLOT_BOTTOM = VIEW_HEIGHT - 44;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;
const X_LABEL_Y = VIEW_HEIGHT - 22;

function formatWeekLabel(weekStartUnix: number): string {
    return new Date(weekStartUnix * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

function buildSeries(
    weeks: { week_start: number; week_end: number }[],
    weekStats: (WeekStatistics | undefined)[]
): { columns: WeekTrendColumn[]; series: CategoryWeekSeries[] } {
    const columns: WeekTrendColumn[] = weeks.map((w) => ({
        week_start: w.week_start,
        label: formatWeekLabel(w.week_start),
    }));

    const categoryMeta = new Map<string, { color: string; values: number[] }>();

    weeks.forEach((_, weekIdx) => {
        const stats = weekStats[weekIdx];
        const activeDays = Math.max(1, stats?.number_of_active_days ?? 0);
        const seen = new Set<string>();

        for (const cat of stats?.categories ?? []) {
            seen.add(cat.category);
            const dailyAvg = Math.floor(cat.total_duration / activeDays);
            const existing = categoryMeta.get(cat.category);
            if (existing) {
                existing.values[weekIdx] = dailyAvg;
                if (cat.color) existing.color = cat.color;
            } else {
                const values = new Array(weeks.length).fill(0);
                values[weekIdx] = dailyAvg;
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
        .map(([category, { color, values }]) => ({
            category,
            color,
            dailyAvgSeconds: values,
        }))
        .filter((s) => s.dailyAvgSeconds.some((v) => v > 0))
        .sort((a, b) => {
            const sumA = a.dailyAvgSeconds.reduce((x, y) => x + y, 0);
            const sumB = b.dailyAvgSeconds.reduce((x, y) => x + y, 0);
            return sumB - sumA;
        });

    return { columns, series };
}

function yForValue(minutes: number, maxMinutes: number): number {
    if (maxMinutes <= 0) return PLOT_BOTTOM;
    return PLOT_BOTTOM - (minutes / maxMinutes) * PLOT_H;
}

function xForWeekIndex(index: number, count: number): number {
    if (count <= 1) return PLOT_LEFT + PLOT_W / 2;
    return PLOT_LEFT + ((index + 0.5) / count) * PLOT_W;
}

type CategoryWeekTrendChartProps = {
    weeks: { week_start: number; week_end: number }[];
    weekStats: (WeekStatistics | undefined)[];
    isLoading: boolean;
    visibleCategoryNames: Set<string>;
};

export default function CategoryWeekTrendChart({
    weeks,
    weekStats,
    isLoading,
    visibleCategoryNames,
}: CategoryWeekTrendChartProps) {
    const { columns, series: allSeries } = useMemo(
        () => buildSeries(weeks, weekStats),
        [weeks, weekStats]
    );

    const series = useMemo(
        () => allSeries.filter((s) => visibleCategoryNames.has(s.category)),
        [allSeries, visibleCategoryNames]
    );

    const maxMinutes = useMemo(() => {
        let max = 1;
        for (const s of series) {
            for (const sec of s.dailyAvgSeconds) {
                max = Math.max(max, sec / 60);
            }
        }
        return max;
    }, [series]);

    const yTicks = useMemo(() => {
        const step = maxMinutes / 4;
        return [0, 1, 2, 3, 4].map((i) => Math.round(step * i));
    }, [maxMinutes]);

    const linePaths = useMemo(() => {
        return series.map((s) => {
            const points = s.dailyAvgSeconds.map((sec, i) => {
                const x = xForWeekIndex(i, columns.length);
                const y = yForValue(sec / 60, maxMinutes);
                return `${i === 0 ? "M" : "L"} ${x} ${y}`;
            });
            return { category: s.category, color: s.color, d: points.join(" ") };
        });
    }, [series, columns.length, maxMinutes]);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[320px] text-gray-500 text-sm">
                Loading week trends...
            </div>
        );
    }

    if (weeks.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[320px] text-gray-500 text-sm text-center px-4">
                Select a date range that includes at least one week.
            </div>
        );
    }

    if (series.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[320px] text-gray-500 text-sm text-center px-4">
                {visibleCategoryNames.size === 0
                    ? "Select at least one category in the filter."
                    : "No category data for the selected weeks."}
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-900 rounded p-4">
            <p className="text-sm text-gray-400 shrink-0 mb-3">
                Daily average per category, by week (active days in each week)
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 pb-4 border-b border-gray-800 shrink-0 max-h-28 overflow-y-auto nice-scrollbar">
                {series.map((s) => (
                    <div key={s.category} className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-xs text-gray-300 truncate">{s.category}</span>
                    </div>
                ))}
            </div>
            <div className="relative flex-1 min-h-[min(520px,calc(100vh-18rem))] w-full">
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="overflow-visible block"
                >
                    {yTicks.map((tick) => {
                        const y = yForValue(tick, maxMinutes);
                        return (
                            <g key={tick}>
                                <line
                                    x1={PLOT_LEFT}
                                    y1={y}
                                    x2={PLOT_RIGHT}
                                    y2={y}
                                    stroke="#374151"
                                    strokeWidth="1"
                                    strokeDasharray="2,2"
                                />
                                <text
                                    x={PLOT_LEFT - 8}
                                    y={y + 4}
                                    fill="#9ca3af"
                                    fontSize="11"
                                    textAnchor="end"
                                >
                                    {tick === 0 ? "0" : formatDuration(tick * 60)}
                                </text>
                            </g>
                        );
                    })}
                    {columns.map((col, i) => {
                        const x = xForWeekIndex(i, columns.length);
                        return (
                            <text
                                key={col.week_start}
                                x={x}
                                y={X_LABEL_Y}
                                fill="#9ca3af"
                                fontSize="10"
                                textAnchor="middle"
                            >
                                {col.label}
                            </text>
                        );
                    })}
                    {linePaths.map((line) => (
                        <path
                            key={line.category}
                            d={line.d}
                            fill="none"
                            stroke={line.color}
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    ))}
                    {series.map((s) =>
                        s.dailyAvgSeconds.map((sec, i) => {
                            const x = xForWeekIndex(i, columns.length);
                            const y = yForValue(sec / 60, maxMinutes);
                            return (
                                <circle
                                    key={`${s.category}-${columns[i]?.week_start}`}
                                    cx={x}
                                    cy={y}
                                    r="4"
                                    fill={s.color}
                                />
                            );
                        })
                    )}
                </svg>
            </div>
        </div>
    );
}
