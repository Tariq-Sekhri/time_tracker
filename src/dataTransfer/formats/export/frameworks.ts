import type {ExportManualEntry} from "../../../api/dataTransfer.ts";
import type {FrameworkId} from "../../types.ts";
import {type Cell, text} from "./cells.ts";
import type {ColumnSpec} from "./columns.ts";

/*
 * Manual-entry layouts that other time trackers can import.
 *
 * Clockify  — Workspace settings → Import → Timesheets. Headers follow Clockify's import
 *             template ("Email", "Start date", "Start time", "Duration" required). Start date is
 *             MM/DD/YYYY (Clockify's default profile format), start time "09:00 AM" or "13:00"
 *             (per the time format option; must match the importing user's profile), Duration
 *             follows the duration format option (hms "01:30:00", hm "01:30", decimal "1.50") and
 *             must match the workspace's duration format.
 * Toggl     — Settings → Data import (CSV). Fixed formats: Start date YYYY-MM-DD, Start time
 *             HH:MM:SS (24h), Duration HH:MM:SS. Email, Duration, Start date and Start time required.
 * Harvest   — Settings → Import/Export → Import time. Fixed column order Date, Client, Project,
 *             Task, Notes, Hours, First name, Last name. Date YYYY-MM-DD, Hours decimal. Harvest
 *             cannot import start/end times; First/Last name must match a person in the account.
 *
 * Category mapping (Clockify / Toggl): subcategory → Client = parent, Project = category;
 * top-level → Project = category, no client; Uncategorized → no project.
 * Harvest requires a client and project: Client = parent category or "Internal",
 * Project = category ("Uncategorized" kept as is), Task = "General".
 */

type EntryColumn = ColumnSpec<ExportManualEntry>;

const UNCATEGORIZED = "Uncategorized";

/** Project/category name for tools where an empty project means "no project". */
const projectOf = (entry: ExportManualEntry) => (entry.category_id === null ? "" : entry.category);

/** Splits "Ada Lovelace King" into ["Ada", "Lovelace King"]. */
export function splitName(name: string): [string, string] {
    const trimmed = name.trim();
    const space = trimmed.indexOf(" ");
    if (space < 0) return [trimmed, ""];
    return [trimmed.slice(0, space), trimmed.slice(space + 1).trim()];
}

const fixed = (value: string): Cell => text(value);

const clockifyColumns: EntryColumn[] = [
    {key: "project", label: "Project", defaultOn: true, get: (r) => text(projectOf(r))},
    {key: "client", label: "Client", defaultOn: true, get: (r) => text(r.parent_category)},
    {key: "description", label: "Description", defaultOn: true, get: (r) => text(r.title)},
    {key: "task", label: "Task", defaultOn: true, get: () => fixed("")},
    {key: "user", label: "User", defaultOn: false, get: (_r, c) => text(c.options.userName.trim())},
    {key: "email", label: "Email", defaultOn: true, required: true, get: (_r, c) => text(c.options.userEmail.trim())},
    {key: "tags", label: "Tag", defaultOn: true, get: () => fixed("")},
    {key: "billable", label: "Billable", defaultOn: true, get: () => fixed("No")},
    {key: "start_date", label: "Start date", defaultOn: true, required: true, get: (r) => ({kind: "date", ts: r.start_time, format: "us"})},
    {key: "start_time", label: "Start time", defaultOn: true, required: true, get: (r) => ({kind: "time", ts: r.start_time, seconds: false, padHours: true})},
    {key: "end_date", label: "End date", defaultOn: false, get: (r) => ({kind: "date", ts: r.end_time, format: "us"})},
    {key: "end_time", label: "End time", defaultOn: false, get: (r) => ({kind: "time", ts: r.end_time, seconds: false, padHours: true})},
    {key: "duration", label: "Duration", defaultOn: true, required: true, total: true, get: (r, c) => ({kind: "duration", seconds: c.round(r.duration), padHours: true})},
    {key: "duration_decimal", label: "Duration (decimal)", defaultOn: false, total: true, get: (r, c) => ({kind: "duration", seconds: c.round(r.duration), format: "decimal"})},
];

const togglColumns: EntryColumn[] = [
    {key: "email", label: "Email", defaultOn: true, required: true, get: (_r, c) => text(c.options.userEmail.trim())},
    {key: "duration", label: "Duration (HH:MM:SS)", header: "Duration", defaultOn: true, required: true, total: true, get: (r, c) => ({kind: "duration", seconds: c.round(r.duration), format: "hms", padHours: true})},
    {key: "project", label: "Project", defaultOn: true, get: (r) => text(projectOf(r))},
    {key: "description", label: "Description", defaultOn: true, get: (r) => text(r.title)},
    {key: "start_date", label: "Start date (YYYY-MM-DD)", header: "Start date", defaultOn: true, required: true, get: (r) => ({kind: "date", ts: r.start_time, format: "iso"})},
    {key: "start_time", label: "Start time (HH:MM:SS, 24h)", header: "Start time", defaultOn: true, required: true, get: (r) => ({kind: "time", ts: r.start_time, format: "24h"})},
    {key: "client", label: "Client", defaultOn: true, get: (r) => text(r.parent_category)},
    {key: "task", label: "Task", defaultOn: true, get: () => fixed("")},
    {key: "tags", label: "Tags", defaultOn: true, get: () => fixed("")},
    {key: "billable", label: "Billable", defaultOn: true, get: () => fixed("No")},
    {key: "user", label: "User", defaultOn: false, get: (_r, c) => text(c.options.userName.trim())},
    {key: "end_date", label: "End date (YYYY-MM-DD, ignored by Toggl)", header: "End date", defaultOn: false, get: (r) => ({kind: "date", ts: r.end_time, format: "iso"})},
    {key: "end_time", label: "End time (HH:MM:SS, ignored by Toggl)", header: "End time", defaultOn: false, get: (r) => ({kind: "time", ts: r.end_time, format: "24h"})},
];

const harvestColumns: EntryColumn[] = [
    {key: "date", label: "Date (YYYY-MM-DD)", header: "Date", defaultOn: true, required: true, get: (r) => ({kind: "date", ts: r.start_time, format: "iso"})},
    {key: "client", label: "Client", defaultOn: true, required: true, get: (r) => text(r.parent_category ?? "Internal")},
    {key: "project", label: "Project", defaultOn: true, required: true, get: (r) => text(r.category || UNCATEGORIZED)},
    {key: "task", label: "Task", defaultOn: true, required: true, get: () => text("General")},
    {key: "notes", label: "Notes", defaultOn: true, required: true, get: (r) => text(r.notes?.trim() ? `${r.title} — ${r.notes.trim()}` : r.title)},
    {key: "hours", label: "Hours (decimal)", header: "Hours", defaultOn: true, required: true, total: true, get: (r, c) => ({kind: "duration", seconds: c.round(r.duration), format: "decimal"})},
    {key: "first_name", label: "First name", defaultOn: true, required: true, get: (_r, c) => text(splitName(c.options.userName)[0])},
    {key: "last_name", label: "Last name", defaultOn: true, required: true, get: (_r, c) => text(splitName(c.options.userName)[1])},
];

export const FRAMEWORK_COLUMNS: Record<Exclude<FrameworkId, "native">, EntryColumn[]> = {
    clockify: clockifyColumns,
    toggl: togglColumns,
    harvest: harvestColumns,
};

export const FRAMEWORK_LABELS: Record<FrameworkId, string> = {
    native: "Time Tracker",
    clockify: "Clockify",
    toggl: "Toggl Track",
    harvest: "Harvest",
};

/** Short guidance shown next to the framework picker. */
export const FRAMEWORK_NOTES: Record<FrameworkId, string> = {
    native: "This app's own layout. All date, time and duration options apply.",
    clockify:
        "Import in Clockify under Workspace settings → Import → Timesheets. Email must belong to a workspace member. " +
        "Start date is written as MM/DD/YYYY and start time in your chosen 12h/24h format — both must match your Clockify profile; " +
        "Duration uses your chosen duration format and must match the workspace setting. Subcategories become Client (parent) + Project.",
    toggl:
        "Import in Toggl Track under Settings → Data import (CSV, admins only). Toggl requires fixed formats, so date, time and duration " +
        "options are ignored: Start date YYYY-MM-DD, Start time HH:MM:SS (24h), Duration HH:MM:SS. Email must belong to a workspace member.",
    harvest:
        "Import in Harvest under Settings → Import/Export → Import time (admins only). Harvest stores durations only (no start/end times). " +
        "Date is YYYY-MM-DD and Hours decimal regardless of options. First and last name come from your name and must match a person in Harvest. " +
        "Client is the parent category (or \"Internal\"), Project the category, Task \"General\".",
};
