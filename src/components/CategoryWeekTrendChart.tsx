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

const PLOT_LEFT = 56;
const PLOT_RIGHT = 780;
const PLOT_TOP = 16;
const PLOT_BOTTOM = 220;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

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
        return <div className="text-gray-500 text-sm py-12 text-center">Loading week trends...</div>;
    }

    if (weeks.length === 0) {
        return <div className="text-gray-500 text-sm py-12 text-center">Select a date range that includes at least one week.</div>;
    }

    if (series.length === 0) {
        return (
            <div className="text-gray-500 text-sm py-12 text-center">
                {visibleCategoryNames.size === 0
                    ? "Select at least one category in the filter."
                    : "No category data for the selected weeks."}
            </div>
        );
    }

    return (
        <div className="bg-gray-900 p-4 rounded">
            <p className="text-sm text-gray-400 mb-4">Daily average per category, by week (active days in each week)</p>
            <div className="relative h-64 md:h-72">
                <svg width="100%" height="100%" viewBox="0 0 800 280" className="overflow-visible">
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
                                <text x={PLOT_LEFT - 6} y={y + 3} fill="#9ca3af" fontSize="10" textAnchor="end">
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
                                y="258"
                                fill="#9ca3af"
                                fontSize="9"
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
                            strokeWidth="2"
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
                                    r="3"
                                    fill={s.color}
                                />
                            );
                        })
                    )}
                </svg>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-gray-800">
                {series.map((s) => (
                    <div key={s.category} className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-xs text-gray-300 truncate">{s.category}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
