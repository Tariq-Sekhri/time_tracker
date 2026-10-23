import type {
    ExportActivityCategory,
    ExportActivityLog,
    ExportActivitySession,
    ExportAppGroup,
    ExportDevice,
    ExportManualCategory,
    ExportManualEntry,
} from "../../../api/dataTransfer.ts";
import type {DatasetKey, ExportOptions} from "../../types.ts";
import {formatDuration, roundDuration} from "../shared.ts";
import {bool, type Cell, EMPTY, num, text} from "./cells.ts";

/** Row type of each tabular dataset. Skipped apps are plain strings in ExportDataset. */
export type DatasetRows = {
    manual_entries: ExportManualEntry;
    activity_sessions: ExportActivitySession;
    activity_logs: ExportActivityLog;
    devices: ExportDevice;
    activity_categories: ExportActivityCategory;
    manual_categories: ExportManualCategory;
    app_groups: ExportAppGroup;
    skipped_apps: {regex: string};
};

export type CellContext = {
    options: ExportOptions;
    /** Rounds a duration per options.rounding / roundingMode. */
    round: (seconds: number) => number;
};

export type ColumnSpec<Row> = {
    key: string;
    /** UI label (column picker). */
    label: string;
    /** File header when it differs from the label (framework layouts need exact headers). */
    header?: string;
    defaultOn: boolean;
    /** Framework layouts: the target tool needs this column to import. */
    required?: boolean;
    /** Excel adds a SUBTOTAL row for this column. */
    total?: boolean;
    /** Excel: wrap long text. */
    wrap?: boolean;
    get: (row: Row, ctx: CellContext) => Cell;
};

export type AnyColumnSpec = ColumnSpec<never>;

export function cellContext(options: ExportOptions): CellContext {
    return {options, round: (seconds) => roundDuration(seconds, options.rounding, options.roundingMode)};
}

const col = <Row>(spec: ColumnSpec<Row>): ColumnSpec<Row> => spec;

const date = (ts: number): Cell => ({kind: "date", ts});
const time = (ts: number): Cell => ({kind: "time", ts});
const duration = (seconds: number): Cell => ({kind: "duration", seconds});
const color = (value: string | null): Cell => ({kind: "color", value: value || null});

export const CATEGORY_PATH_SEPARATOR = " › ";

export function manualCategoryPath(entry: {category: string; parent_category: string | null}): string {
    return entry.parent_category ? `${entry.parent_category}${CATEGORY_PATH_SEPARATOR}${entry.category}` : entry.category;
}

/** "Code (1:20); Chrome (0:15)". Decimal duration format gives "Code (1.33h)". */
export function appsSummary(session: ExportActivitySession, ctx: CellContext): string {
    const decimal = ctx.options.durationFormat === "decimal";
    return session.apps
        .map((app) => `${app.app} (${decimal ? `${formatDuration(app.duration, "decimal")}h` : formatDuration(app.duration, "hm")})`)
        .join("; ");
}

const manualEntryColumns: ColumnSpec<ExportManualEntry>[] = [
    col({key: "date", label: "Date", defaultOn: true, get: (r) => date(r.start_time)}),
    col({key: "start", label: "Start", defaultOn: true, get: (r) => time(r.start_time)}),
    col({key: "end", label: "End", defaultOn: true, get: (r) => time(r.end_time)}),
    col({key: "duration", label: "Duration", defaultOn: true, total: true, get: (r, c) => duration(c.round(r.duration))}),
    col({key: "title", label: "Title", defaultOn: true, get: (r) => text(r.title)}),
    col({key: "category", label: "Category", defaultOn: true, get: (r) => text(r.category)}),
    col({key: "parent_category", label: "Parent category", defaultOn: true, get: (r) => text(r.parent_category)}),
    col({key: "category_path", label: "Category path", defaultOn: true, get: (r) => text(manualCategoryPath(r))}),
    col({key: "notes", label: "Notes", defaultOn: true, wrap: true, get: (r) => text(r.notes)}),
    col({key: "category_color", label: "Category color", defaultOn: false, get: (r) => color(r.category_color)}),
    col({key: "id", label: "ID", defaultOn: false, get: (r) => num(r.id)}),
    col({key: "created_at", label: "Created", defaultOn: false, get: (r) => ({kind: "datetime", ts: r.created_at})}),
    col({key: "updated_at", label: "Updated", defaultOn: false, get: (r) => ({kind: "datetime", ts: r.updated_at})}),
];

const activitySessionColumns: ColumnSpec<ExportActivitySession>[] = [
    col({key: "date", label: "Date", defaultOn: true, get: (r) => date(r.start_time)}),
    col({key: "start", label: "Start", defaultOn: true, get: (r) => time(r.start_time)}),
    col({key: "end", label: "End", defaultOn: true, get: (r) => time(r.end_time)}),
    col({key: "duration", label: "Duration", defaultOn: true, total: true, get: (r, c) => duration(c.round(r.duration))}),
    col({key: "active_duration", label: "Active time", defaultOn: true, total: true, get: (r, c) => duration(c.round(r.active_duration))}),
    col({key: "category", label: "Category", defaultOn: true, get: (r) => text(r.category)}),
    col({key: "device", label: "Device", defaultOn: true, get: (r) => text(r.device_name)}),
    col({key: "top_app", label: "Top app", defaultOn: true, get: (r) => text(r.apps[0]?.app)}),
    col({key: "apps", label: "Apps", defaultOn: true, wrap: true, get: (r, c) => text(appsSummary(r, c))}),
    col({key: "app_count", label: "App count", defaultOn: false, get: (r) => num(r.apps.length)}),
    col({key: "category_color", label: "Category color", defaultOn: false, get: (r) => color(r.category_color)}),
    col({key: "device_uuid", label: "Device ID", defaultOn: false, get: (r) => text(r.device_uuid)}),
];

const activityLogColumns: ColumnSpec<ExportActivityLog>[] = [
    col({key: "date", label: "Date", defaultOn: true, get: (r) => date(r.timestamp)}),
    col({key: "time", label: "Time", defaultOn: true, get: (r) => time(r.timestamp)}),
    col({key: "duration", label: "Duration", defaultOn: true, total: true, get: (r, c) => duration(c.round(r.duration))}),
    col({key: "app", label: "App / window", defaultOn: true, get: (r) => text(r.app)}),
    col({key: "app_group", label: "App group", defaultOn: true, get: (r) => text(r.app_group)}),
    col({key: "category", label: "Category", defaultOn: true, get: (r) => text(r.category)}),
    col({key: "device", label: "Device", defaultOn: true, get: (r) => text(r.device_name)}),
    col({key: "device_uuid", label: "Device ID", defaultOn: false, get: (r) => text(r.device_uuid)}),
    col({key: "id", label: "Log ID", defaultOn: false, get: (r) => num(r.id)}),
];

const deviceColumns: ColumnSpec<ExportDevice>[] = [
    col({key: "name", label: "Name", defaultOn: true, get: (r) => text(r.name)}),
    col({key: "kind", label: "Kind", defaultOn: true, get: (r) => text(r.kind === "local" ? "This device" : "Remote")}),
    col({key: "uuid", label: "Device ID", defaultOn: true, get: (r) => text(r.uuid)}),
    col({key: "in_cal", label: "Shown in calendar", defaultOn: true, get: (r) => bool(r.in_cal)}),
    col({key: "in_stats", label: "Counted in stats", defaultOn: true, get: (r) => bool(r.in_stats)}),
];

const activityCategoryColumns: ColumnSpec<ExportActivityCategory>[] = [
    col({key: "name", label: "Name", defaultOn: true, get: (r) => text(r.name)}),
    col({key: "color", label: "Color", defaultOn: true, get: (r) => color(r.color)}),
    col({key: "priority", label: "Priority", defaultOn: true, get: (r) => num(r.priority)}),
    col({key: "is_visible", label: "Visible", defaultOn: true, get: (r) => bool(r.is_visible)}),
    col({key: "in_stats", label: "Counted in stats", defaultOn: true, get: (r) => bool(r.in_stats)}),
    col({key: "rules", label: "Rules", defaultOn: true, wrap: true, get: (r) => text(r.rules.join(" | "))}),
    col({key: "rule_count", label: "Rule count", defaultOn: true, get: (r) => num(r.rules.length)}),
];

const manualCategoryColumns: ColumnSpec<ExportManualCategory>[] = [
    col({key: "name", label: "Name", defaultOn: true, get: (r) => text(r.name)}),
    col({key: "parent_name", label: "Parent", defaultOn: true, get: (r) => text(r.parent_name)}),
    col({key: "path", label: "Path", defaultOn: true, get: (r) => text(manualCategoryPath({category: r.name, parent_category: r.parent_name}))}),
    col({key: "color", label: "Color", defaultOn: true, get: (r) => color(r.color)}),
    col({key: "id", label: "ID", defaultOn: true, get: (r) => (r.id === null ? EMPTY : num(r.id))}),
];

const appGroupColumns: ColumnSpec<ExportAppGroup>[] = [
    col({key: "name", label: "Name", defaultOn: true, get: (r) => text(r.name)}),
    col({key: "regex", label: "Pattern (regex)", defaultOn: true, get: (r) => text(r.regex)}),
];

const skippedAppColumns: ColumnSpec<{regex: string}>[] = [
    col({key: "regex", label: "Pattern (regex)", defaultOn: true, get: (r) => text(r.regex)}),
];

export const NATIVE_COLUMNS: {[K in DatasetKey]: ColumnSpec<DatasetRows[K]>[]} = {
    manual_entries: manualEntryColumns,
    activity_sessions: activitySessionColumns,
    activity_logs: activityLogColumns,
    devices: deviceColumns,
    activity_categories: activityCategoryColumns,
    manual_categories: manualCategoryColumns,
    app_groups: appGroupColumns,
    skipped_apps: skippedAppColumns,
};

/** Output order of datasets in files / sheets. */
export const DATASET_ORDER: DatasetKey[] = [
    "manual_entries",
    "activity_sessions",
    "activity_logs",
    "devices",
    "activity_categories",
    "manual_categories",
    "app_groups",
    "skipped_apps",
];

/** Human titles, also used as Excel sheet names (≤ 31 chars). */
export const DATASET_TITLES: Record<DatasetKey, string> = {
    manual_entries: "Manual entries",
    activity_sessions: "Activity sessions",
    activity_logs: "Activity log",
    devices: "Devices",
    activity_categories: "Activity categories",
    manual_categories: "Manual categories",
    app_groups: "App groups",
    skipped_apps: "Skipped apps",
};
