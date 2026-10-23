import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ExportOptions, SummaryGrouping} from "../../types.ts";
import {dayKey, formatDate, roundDuration, weekKey} from "../shared.ts";

/*
 * Grouped totals for the Excel "Summary" sheet, the summary CSV and the PDF report.
 *
 * Manual time = manual entry durations, each rounded per options.
 * Activity time = active (tracked) time of activity sessions, each rounded per options. When
 * no sessions were exported, activity logs are used instead; logs are seconds-long, so they are
 * summed per group and the group total is rounded (rounding each log would erase them).
 * Totals are always the sum of the (rounded) group values, so a TOTAL row adds up.
 */

export type SummaryKind = "manual" | "activity";

export type SummaryGroup = {
    /** Stable key: YYYY-MM-DD (day / week Monday), "manual:<name>" / "activity:<name>" (category), "manual" / device uuid (device). */
    key: string;
    label: string;
    /** Category / device grouping: which kind of time the group holds. null for day / week. */
    kind: SummaryKind | null;
    color: string | null;
    manual: number;
    activity: number;
    total: number;
    manualCount: number;
    activityCount: number;
};

export type ExportSummary = {
    grouping: SummaryGrouping;
    /** Empty when grouping is "none". Day / week sorted chronologically; category / device by total, largest first. */
    groups: SummaryGroup[];
    manual: number;
    activity: number;
    total: number;
    manualCount: number;
    activityCount: number;
    /** Distinct local days with any manual or activity time. */
    activeDays: number;
    activitySource: "sessions" | "logs" | "none";
    rangeStart: number;
    rangeEnd: number;
};

export const GROUPING_LABELS: Record<SummaryGrouping, string> = {
    none: "Total",
    day: "Day",
    week: "Week",
    category: "Category",
    device: "Device",
};

export const KIND_LABELS: Record<SummaryKind, string> = {manual: "Manual", activity: "Activity"};

type Item = {ts: number; seconds: number; kind: SummaryKind; category: string; color: string | null; deviceKey: string; deviceName: string};

type GroupInfo = {key: string; label: string; kind: SummaryKind | null; color: string | null; sortKey: string};

export function summarize(dataset: ExportDataset, options: ExportOptions, grouping: SummaryGrouping = options.summaryGrouping): ExportSummary {
    const round = (seconds: number) => roundDuration(seconds, options.rounding, options.roundingMode);
    const manualColors = new Map(dataset.manual_categories.filter((c) => c.parent_id === null).map((c) => [c.name, c.color]));

    const manualItems: Item[] = dataset.manual_entries.map((entry) => {
        const topLevel = entry.parent_category ?? entry.category;
        return {
            ts: entry.start_time,
            seconds: entry.duration,
            kind: "manual",
            category: topLevel,
            color: entry.parent_category ? (manualColors.get(entry.parent_category) ?? entry.category_color) : entry.category_color,
            deviceKey: "manual",
            deviceName: "Manual time",
        };
    });

    const activitySource: ExportSummary["activitySource"] = dataset.activity_sessions.length
        ? "sessions"
        : dataset.activity_logs.length
          ? "logs"
          : "none";
    const activityColors = new Map(dataset.activity_categories.map((c) => [c.name, c.color]));
    const activityItems: Item[] =
        activitySource === "sessions"
            ? dataset.activity_sessions.map((s) => ({
                  ts: s.start_time,
                  seconds: s.active_duration,
                  kind: "activity",
                  category: s.category,
                  color: s.category_color ?? activityColors.get(s.category) ?? null,
                  deviceKey: s.device_uuid,
                  deviceName: s.device_name,
              }))
            : dataset.activity_logs.map((log) => ({
                  ts: log.timestamp,
                  seconds: log.duration,
                  kind: "activity",
                  category: log.category,
                  color: activityColors.get(log.category) ?? null,
                  deviceKey: log.device_uuid,
                  deviceName: log.device_name,
              }));
    const roundEachActivity = activitySource === "sessions";

    const groupOf = (item: Item): GroupInfo => {
        switch (grouping) {
            case "day": {
                const key = dayKey(item.ts);
                return {key, label: formatDate(item.ts, options.dateFormat), kind: null, color: null, sortKey: key};
            }
            case "week": {
                const key = weekKey(item.ts);
                const [y, m, d] = key.split("-").map(Number);
                const monday = Math.floor(new Date(y, m - 1, d).getTime() / 1000);
                return {key, label: `Week of ${formatDate(monday, options.dateFormat)}`, kind: null, color: null, sortKey: key};
            }
            case "category":
                return {key: `${item.kind}:${item.category}`, label: item.category, kind: item.kind, color: item.color, sortKey: ""};
            case "device":
                return {key: item.deviceKey, label: item.deviceName, kind: item.kind, color: null, sortKey: ""};
            default:
                return {key: "all", label: "Total", kind: null, color: null, sortKey: ""};
        }
    };

    type Acc = GroupInfo & {manual: number; activity: number; activityRaw: number; manualCount: number; activityCount: number};
    const groups = new Map<string, Acc>();
    const days = new Set<string>();
    for (const item of [...manualItems, ...activityItems]) {
        if (item.seconds > 0) days.add(dayKey(item.ts));
        const info = groupOf(item);
        let acc = groups.get(info.key);
        if (!acc) {
            acc = {...info, manual: 0, activity: 0, activityRaw: 0, manualCount: 0, activityCount: 0};
            groups.set(info.key, acc);
        }
        if (item.kind === "manual") {
            acc.manual += round(item.seconds);
            acc.manualCount++;
        } else {
            if (roundEachActivity) acc.activity += round(item.seconds);
            else acc.activityRaw += item.seconds;
            acc.activityCount++;
        }
        if (!acc.color && info.color) acc.color = info.color;
    }

    const all: SummaryGroup[] = [...groups.values()].map((acc) => {
        const activity = roundEachActivity ? acc.activity : round(acc.activityRaw);
        return {
            key: acc.key,
            label: acc.label,
            kind: acc.kind,
            color: acc.color,
            manual: acc.manual,
            activity,
            total: acc.manual + activity,
            manualCount: acc.manualCount,
            activityCount: acc.activityCount,
        };
    });
    const sortKeys = new Map([...groups.values()].map((acc) => [acc.key, acc.sortKey]));
    if (grouping === "day" || grouping === "week") {
        all.sort((a, b) => (sortKeys.get(a.key) ?? "").localeCompare(sortKeys.get(b.key) ?? ""));
    } else {
        all.sort((a, b) => b.total - a.total || (a.kind === b.kind ? 0 : a.kind === "manual" ? -1 : 1) || a.label.localeCompare(b.label));
    }

    const sum = (pick: (g: SummaryGroup) => number) => all.reduce((total, g) => total + pick(g), 0);
    const manual = sum((g) => g.manual);
    const activity = sum((g) => g.activity);
    return {
        grouping,
        groups: grouping === "none" ? [] : all,
        manual,
        activity,
        total: manual + activity,
        manualCount: manualItems.length,
        activityCount: activityItems.length,
        activeDays: days.size,
        activitySource,
        rangeStart: dataset.range_start,
        rangeEnd: dataset.range_end,
    };
}
