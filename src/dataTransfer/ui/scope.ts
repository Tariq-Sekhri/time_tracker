import type {ExportDataset, ExportFilterOptions, ExportInclude, ExportScope} from "../../api/dataTransfer.ts";
import type {DatasetKey, ExportFormat, FrameworkId} from "../types.ts";
import type {ResolvedRange} from "./dateRanges.ts";

/** Pure helpers that turn the export screen's state into an ExportScope and readable text. */

export type DatasetMeta = {
    key: DatasetKey;
    label: string;
    description: string;
    /** Singular / plural nouns for summary sentences. */
    noun: [string, string];
    /** Filters that narrow this dataset. */
    filters: FilterKey[];
    advanced?: boolean;
    /** Depends on the date range. */
    ranged: boolean;
};

export type FilterKey = "devices" | "activityCategories" | "manualCategories";

export const DATASETS: DatasetMeta[] = [
    {key: "manual_entries", label: "Manual time entries", description: "Time you logged by hand, with titles, notes and categories.", noun: ["manual entry", "manual entries"], filters: ["manualCategories"], ranged: true},
    {key: "activity_sessions", label: "Activity sessions", description: "Automatically tracked calendar blocks with their top apps.", noun: ["session", "sessions"], filters: ["devices", "activityCategories"], ranged: true},
    {key: "activity_logs", label: "Raw activity logs", description: "Every recorded window and app event. Can be very large.", noun: ["activity log", "activity logs"], filters: ["devices", "activityCategories"], advanced: true, ranged: true},
    {key: "devices", label: "Devices", description: "This computer and synced devices.", noun: ["device", "devices"], filters: [], ranged: false},
    {key: "activity_categories", label: "Activity categories & rules", description: "Category names, colors, priorities and matching rules.", noun: ["activity category", "activity categories"], filters: [], ranged: false},
    {key: "manual_categories", label: "Manual categories", description: "Categories and subcategories for manual time.", noun: ["manual category", "manual categories"], filters: [], ranged: false},
    {key: "app_groups", label: "App groups", description: "Rules that merge app titles into one name.", noun: ["app group", "app groups"], filters: [], ranged: false},
    {key: "skipped_apps", label: "Skipped apps", description: "Apps excluded from tracking.", noun: ["skipped app", "skipped apps"], filters: [], ranged: false},
];

export const DATASET_KEYS = DATASETS.map((item) => item.key);

/** Raw logs above this count get a size warning. */
export const LARGE_LOG_COUNT = 50_000;

export function datasetMeta(key: DatasetKey): DatasetMeta {
    return DATASETS.find((item) => item.key === key)!;
}

export function emptyInclude(): ExportInclude {
    return {manual_entries: false, activity_sessions: false, activity_logs: false, devices: false, activity_categories: false, manual_categories: false, app_groups: false, skipped_apps: false};
}

export function timesheetInclude(): ExportInclude {
    return {...emptyInclude(), manual_entries: true};
}

export function everythingInclude(): ExportInclude {
    return {manual_entries: true, activity_sessions: true, activity_logs: true, devices: true, activity_categories: true, manual_categories: true, app_groups: true, skipped_apps: true};
}

export function includedKeys(include: ExportInclude): DatasetKey[] {
    return DATASET_KEYS.filter((key) => include[key]);
}

/** null = everything (the user has not narrowed the selection). */
export type ExportFilters = {
    devices: string[] | null;
    activityCategories: string[] | null;
    /** Manual category ids; null inside the array = Uncategorized. */
    manualCategories: (number | null)[] | null;
};

export const ALL_FILTERS: ExportFilters = {devices: null, activityCategories: null, manualCategories: null};

/** Whether a filter narrows any of the included datasets. */
export function filterApplies(filter: FilterKey, include: ExportInclude): boolean {
    return DATASETS.some((item) => include[item.key] && item.filters.includes(filter));
}

/**
 * Returns null when the selection is "all" (null, or covers every available option),
 * otherwise the selected values that still exist, in option order.
 */
export function normalizeSelection<T>(selected: T[] | null, available: T[]): T[] | null {
    if (selected == null) return null;
    const chosen = new Set(selected);
    if (available.length > 0 && available.every((value) => chosen.has(value))) return null;
    if (available.length === 0) return [...selected];
    return available.filter((value) => chosen.has(value));
}

export function filterValues(options: ExportFilterOptions | undefined) {
    return {
        devices: options?.devices.map((device) => device.uuid) ?? [],
        activityCategories: options?.activity_categories.map((category) => category.name) ?? [],
        manualCategories: options?.manual_categories.map((category) => category.id) ?? [],
    };
}

/**
 * Builds the backend scope. Filter arrays are only sent when the user narrowed the selection
 * and the filter applies to an included dataset; otherwise null (= all).
 */
export function buildScope(range: ResolvedRange, include: ExportInclude, filters: ExportFilters, options: ExportFilterOptions | undefined): ExportScope {
    const values = filterValues(options);
    const pick = <T, >(key: FilterKey, selected: T[] | null, available: T[]) =>
        filterApplies(key, include) ? normalizeSelection(selected, available) : null;
    return {
        range_start: range.start,
        range_end: range.end,
        device_uuids: pick("devices", filters.devices, values.devices),
        activity_categories: pick("activityCategories", filters.activityCategories, values.activityCategories),
        manual_category_ids: pick("manualCategories", filters.manualCategories, values.manualCategories),
        include: {...include},
    };
}

/**
 * Scope used for the live count badges: every dataset is requested (with the current filters)
 * so unselected cards also show a count, except raw activity logs, which can be huge,
 * unless they are selected.
 */
export function buildCountScope(range: ResolvedRange, include: ExportInclude, filters: ExportFilters, options: ExportFilterOptions | undefined): ExportScope {
    const countInclude = {...everythingInclude(), activity_logs: include.activity_logs};
    return buildScope(range, countInclude, filters, options);
}

export type DatasetCounts = Partial<Record<DatasetKey, number>>;

export function datasetCounts(dataset: ExportDataset | undefined): DatasetCounts {
    if (!dataset) return {};
    return {
        manual_entries: dataset.manual_entries.length,
        activity_sessions: dataset.activity_sessions.length,
        activity_logs: dataset.activity_logs.length,
        devices: dataset.devices.length,
        activity_categories: dataset.activity_categories.length,
        manual_categories: dataset.manual_categories.length,
        app_groups: dataset.app_groups.length,
        skipped_apps: dataset.skipped_apps.length,
    };
}

export const FORMAT_LABELS: Record<ExportFormat, string> = {xlsx: "Excel", csv: "CSV", pdf: "PDF", json: "JSON"};

export const FRAMEWORKS: {id: FrameworkId; label: string; hint: string; needsUser: boolean}[] = [
    {id: "native", label: "Time Tracker", hint: "Full detail, re-importable here", needsUser: false},
    {id: "clockify", label: "Clockify", hint: "Import into Clockify", needsUser: true},
    {id: "toggl", label: "Toggl Track", hint: "Import into Toggl Track", needsUser: true},
    {id: "harvest", label: "Harvest", hint: "Import into Harvest", needsUser: true},
];

export function joinWords(parts: string[]): string {
    if (parts.length <= 1) return parts[0] ?? "";
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "142 manual entries and 380 sessions from Mar 1 – Mar 31, 2026 as Excel". */
export function exportSummary(include: ExportInclude, counts: DatasetCounts, rangeText: string | null, format: ExportFormat): string {
    const keys = includedKeys(include);
    if (!keys.length) return "Choose what to export.";
    const parts = keys.map((key) => {
        const [one, many] = datasetMeta(key).noun;
        const count = counts[key];
        return count == null ? many : `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
    });
    const ranged = keys.some((key) => datasetMeta(key).ranged);
    return `${joinWords(parts)}${ranged && rangeText ? ` from ${rangeText}` : ""} as ${FORMAT_LABELS[format]}`;
}

/** "All devices", "2 of 3 devices", "No devices". */
export function selectionSummary(selected: unknown[] | null, total: number, noun: string): string {
    if (selected == null || (total > 0 && selected.length >= total)) return `All ${noun}`;
    if (selected.length === 0) return `No ${noun}`;
    return `${selected.length} of ${total} ${noun}`;
}
