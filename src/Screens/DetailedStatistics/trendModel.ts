import type {AppStat, TrendWeekStatistics} from "../../api/statistics.ts";
import {adjustInstantToCalendarDayBoundary} from "../../utils.ts";
import type {WeekTrendColumn, CategoryWeekSeries, TrendValueMode, TrendAppRanking} from "./CategoryWeekTrendChart.tsx";
const APP_LINE_COLORS = ["#60a5fa","#f472b6","#34d399","#fbbf24","#a78bfa","#fb923c","#22d3ee","#f87171","#a3e635","#c084fc"];
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

const weekLabelFormatter = new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric"});
function normalizeWeekValue(duration: number, dayCount: number, mode: TrendValueMode): number {
    return mode === "avg" ? duration / dayCount : duration * (7 / dayCount);
}
function formatWeekLabel(weekStartUnix: number): string {
    return weekLabelFormatter.format(new Date(weekStartUnix * 1000));
}

function colorForApp(app: string): string {
    let hash = 0;
    for (let i = 0; i < app.length; i++) {
        hash = (hash * 31 + app.charCodeAt(i)) | 0;
    }
    return APP_LINE_COLORS[Math.abs(hash) % APP_LINE_COLORS.length];
}

export function buildSeries(
    weeks: { week_start: number; week_end: number }[],
    weekStats: (TrendWeekStatistics | undefined)[],
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
        const dayCount = countDaysInTrackedWeekPeriod(
            weekRange.week_start, weekRange.week_end, calendarStartHour
        );

        for (const cat of stats?.categories ?? []) {
            const value = normalizeWeekValue(cat.total_duration, dayCount, mode);
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

    });

    const series = Array.from(categoryMeta.entries())
        .map(([category, {color, values}]) => ({
            category, color, values, total: values.reduce((sum, value) => sum + value, 0),
        }))
        .filter((s) => s.values.some((v) => v > 0))
        .sort((a, b) => b.total - a.total);

    const totalLineValues = weeks.map((weekRange, weekIdx) => {
        const weekTotal = weekStats[weekIdx]?.total_time ?? 0;
        const dayCount = countDaysInTrackedWeekPeriod(
            weekRange.week_start,
            weekRange.week_end,
            calendarStartHour
        );
        return normalizeWeekValue(weekTotal, dayCount, mode);
    });

    return {columns, series, totalLineValues};
}

/** Select a small top list without sorting/copying every app. Equal durations retain backend order. */
function selectTopApps<T extends Pick<AppStat, "app" | "total_duration">>(apps: T[], count: number): T[] {
    if (count <= 0) return [];
    const top: T[] = [];
    for (const app of apps) {
        if (top.length === count && app.total_duration <= top[top.length - 1].total_duration) continue;
        let low = 0;
        let high = top.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (app.total_duration > top[mid].total_duration) high = mid;
            else low = mid + 1;
        }
        top.splice(low, 0, app);
        if (top.length > count) top.pop();
    }
    return top;
}

export function buildTopAppSeries(
    weeks: { week_start: number; week_end: number }[],
    weekStats: (TrendWeekStatistics | undefined)[],
    mode: TrendValueMode,
    calendarStartHour: number,
    topAppCount: number,
    appRanking: TrendAppRanking = "weekly"
): { columns: WeekTrendColumn[]; series: CategoryWeekSeries[]; totalLineValues: number[] } {
    const columns: WeekTrendColumn[] = weeks.map((w) => ({
        week_start: w.week_start,
        label: formatWeekLabel(w.week_start),
    }));
    const appValues = new Map<string, Array<number | null>>();
    const rangeTotals = new Map<string, number>();
    if (appRanking === "range") {
        weeks.forEach((_, index) => {
            for (const app of weekStats[index]?.all_apps ?? []) {
                rangeTotals.set(app.app, (rangeTotals.get(app.app) ?? 0) + app.total_duration);
            }
        });
        const topApps = selectTopApps(
            [...rangeTotals].map(([app, total_duration]) => ({app, total_duration})), topAppCount
        );
        for (const app of topApps) {
            // A loaded week without this app is zero usage, not a ranking gap.
            appValues.set(app.app, weeks.map((_, index) => weekStats[index] ? 0 : null));
        }
    }

    weeks.forEach((weekRange, weekIdx) => {
        const dayCount = countDaysInTrackedWeekPeriod(
            weekRange.week_start, weekRange.week_end, calendarStartHour
        );

        const apps = weekStats[weekIdx]?.all_apps ?? [];
        const topAppsThisWeek = appRanking === "range"
            ? apps.filter((app) => appValues.has(app.app))
            : selectTopApps(apps, topAppCount);

        for (const app of topAppsThisWeek) {
            // Null means this app was not in this week's top list. The chart keeps
            // the point absent but connects repeat appearances with a dotted line.
            const values = appValues.get(app.app) ?? new Array(weeks.length).fill(null);
            values[weekIdx] = normalizeWeekValue(app.total_duration, dayCount, mode);
            appValues.set(app.app, values);
        }
    });

    const series = Array.from(appValues.entries())
        .map(([category, values]) => ({category, color: colorForApp(category), values, total: values.reduce<number>((sum, value) => sum + (value ?? 0), 0)}))
        .filter((s) => s.values.some((v) => (v ?? 0) > 0))
        .sort((a, b) => appRanking === "range"
            ? (rangeTotals.get(b.category) ?? 0) - (rangeTotals.get(a.category) ?? 0)
            : b.total - a.total);

    const totalLineValues = weeks.map((weekRange, weekIdx) => {
        const weekTotal = weekStats[weekIdx]?.total_time ?? 0;
        return normalizeWeekValue(
            weekTotal,
            countDaysInTrackedWeekPeriod(weekRange.week_start, weekRange.week_end, calendarStartHour),
            mode
        );
    });

    return {columns, series, totalLineValues};
}
