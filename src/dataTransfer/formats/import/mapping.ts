import type {ColumnMapping, FrameworkId, ImportField, ImportFieldDef} from "../../types.ts";
import {detectFramework} from "./detect.ts";
import {normalizeHeader} from "./text.ts";

const FIELD_DEFS: ImportFieldDef[] = [
    {field: "title", label: "Title", help: "What the time was spent on (Clockify/Toggl Description, Harvest Notes)."},
    {field: "notes", label: "Notes", help: "Optional longer notes stored with the entry."},
    {field: "category", label: "Category", help: "Top-level category, e.g. the Project column."},
    {field: "subcategory", label: "Subcategory", help: "Optional child category, e.g. the Task column."},
    {field: "client", label: "Client", help: "Client or customer; can become the parent category."},
    {field: "date", label: "Date", help: "Day of the entry, used when start/end only hold a time."},
    {field: "start_datetime", label: "Start (date and time)", help: "One column holding both the start date and time."},
    {field: "start_date", label: "Start date", help: "Start day when date and time are in separate columns."},
    {field: "start_time", label: "Start time", help: "Start time of day, 24h or 12h (2:05 PM)."},
    {field: "end_datetime", label: "End (date and time)", help: "One column holding both the end date and time."},
    {field: "end_date", label: "End date", help: "End day; defaults to the start day (next day if the end time is earlier)."},
    {field: "end_time", label: "End time", help: "End time of day, 24h or 12h."},
    {field: "duration", label: "Duration", help: "Used when there is no end: 1:30:00, 1:30, 1h 30m, 90m or 1.5 (hours)."},
];

export function importFieldDefs(): ImportFieldDef[] {
    return FIELD_DEFS.map((def) => ({...def}));
}

/** Normalized header synonyms per field, most specific first. Each column maps to at most one field. */
const SYNONYMS: [ImportField, string[]][] = [
    ["start_date", ["startdate", "datestart", "startday", "fromdate", "begindate"]],
    ["start_time", ["starttime", "timestart", "fromtime", "begintime", "starttimeofday"]],
    ["end_date", ["enddate", "dateend", "endday", "stopdate", "todate", "finishdate"]],
    ["end_time", ["endtime", "timeend", "stoptime", "totime", "finishtime"]],
    ["start_datetime", ["startdatetime", "startdateandtime", "startedat", "startat", "started", "start", "startedon", "begin", "from", "starttimestamp"]],
    ["end_datetime", ["enddatetime", "enddateandtime", "endedat", "endat", "ended", "end", "stoppedat", "stop", "stopped", "finish", "finished", "to", "endtimestamp"]],
    ["date", ["date", "day", "spentdate", "workdate", "entrydate"]],
    [
        "duration",
        [
            "durationh", "duration", "durationhms", "durationhhmmss", "durationhhmm", "timeh", "timespent", "durationdecimal", "timedecimal",
            "hours", "hoursworked", "durationhours", "durationminutes", "durationmin", "minutes", "durationseconds", "durationsec", "seconds",
            "length", "elapsed", "totaltime", "total", "spent",
        ],
    ],
    ["title", ["description", "title", "taskname", "activity", "name", "summary", "subject", "entry", "entrytitle", "timeentry", "what", "work"]],
    ["notes", ["notes", "note", "comment", "comments", "details", "memo", "remarks"]],
    ["client", ["client", "clientname", "customer", "customername", "company", "account"]],
    ["category", ["parentcategory", "project", "projectname", "category", "categorypath", "job", "jobname"]],
    ["subcategory", ["task", "subcategory", "subproject", "childcategory", "tasktitle"]],
];

/**
 * Best-guess mapping from headers. Exact normalized synonym matches first; columns starting with
 * "duration" / "hours" (e.g. "Duration (hh:mm)") are a fallback for the duration field.
 * - A bare "Start" / "End" column maps to start_time / end_time when a separate date column exists.
 * - Our layout with both "Parent category" and "Category": category ← Parent category, subcategory ← Category.
 * - Harvest (or any file with Notes but no title-like column): Notes is the description → title; notes stays unmapped.
 */
export function guessMapping(headers: string[], framework: FrameworkId | null): ColumnMapping {
    const normalized = headers.map(normalizeHeader);
    const fw = framework ?? detectFramework(headers);
    const used = new Set<number>();
    const mapping: ColumnMapping = {};
    const assign = (field: ImportField, names: string[]) => {
        if (mapping[field] !== undefined) return;
        for (const name of names) {
            const index = normalized.findIndex((h, i) => h === name && !used.has(i));
            if (index >= 0) {
                mapping[field] = index;
                used.add(index);
                return;
            }
        }
    };

    const hasParentCategory = normalized.includes("parentcategory");
    for (const [field, names] of SYNONYMS) {
        if (field === "subcategory" && hasParentCategory) assign(field, ["category", ...names]);
        else assign(field, names);
    }

    if (mapping.duration === undefined) {
        const index = normalized.findIndex((h, i) => !used.has(i) && /^(duration|hours)/.test(h) && !/rounded|rate|amount|billable|cost/.test(h));
        if (index >= 0) {
            mapping.duration = index;
            used.add(index);
        }
    }

    // A bare Start/End next to a Date column holds only the time.
    const hasDate = mapping.date !== undefined || mapping.start_date !== undefined;
    if (hasDate && mapping.start_datetime !== undefined && mapping.start_time === undefined && isBare(normalized[mapping.start_datetime])) {
        mapping.start_time = mapping.start_datetime;
        delete mapping.start_datetime;
    }
    if (hasDate && mapping.end_datetime !== undefined && mapping.end_time === undefined && isBare(normalized[mapping.end_datetime])) {
        mapping.end_time = mapping.end_datetime;
        delete mapping.end_datetime;
    }

    if ((fw === "harvest" || mapping.title === undefined) && mapping.notes !== undefined && mapping.title === undefined) {
        mapping.title = mapping.notes;
        delete mapping.notes;
    }
    return mapping;
}

const isBare = (header: string) => ["start", "end", "from", "to", "begin", "finish", "stop", "started", "ended", "stopped", "finished"].includes(header);
