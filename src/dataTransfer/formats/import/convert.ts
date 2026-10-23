import type {ImportManualEntry} from "../../../api/dataTransfer.ts";
import type {ColumnMapping, ConvertedRow, ImportField, ImportTableOptions, ParsedTable} from "../../types.ts";
import {type DateTimeParts, type DayOrder, type DurationUnit, inferDayOrder, parseDateTime, parseDuration, toUnix, type Ymd} from "./dateParse.ts";
import {normalizeHeader} from "./text.ts";

export const MAX_TITLE_LENGTH = 200;
export const MAX_DURATION_SECONDS = 7 * 86400;
const SUBCATEGORY_SEPARATOR = " — ";

const DATE_FIELDS: ImportField[] = ["date", "start_date", "start_time", "start_datetime", "end_date", "end_time", "end_datetime"];

const FIELD_LABELS: Record<ImportField, string> = {
    title: "title",
    notes: "notes",
    category: "category",
    subcategory: "subcategory",
    client: "client",
    date: "date",
    start_date: "start date",
    start_time: "start time",
    start_datetime: "start",
    end_date: "end date",
    end_time: "end time",
    end_datetime: "end",
    duration: "duration",
};

/**
 * Converts table rows to manual entries. Each row yields an entry or a human error ("Row 3: …").
 * Row numbers in messages are 1-based data rows (the header is not counted).
 *
 * Start = start (date+time) column, or start date / date + start time.
 * End   = end (date+time), or (end date ?? start date) + end time (next day when the end time is earlier
 *         than the start time and no end date was given), or start + duration.
 * Rows with a date + duration but no start time (Harvest) are stacked per day from options.dayStartHour,
 * in row order, each starting where the previous one on that day ended.
 */
export function convertRows(table: ParsedTable, options: ImportTableOptions): ConvertedRow[] {
    const {mapping} = options;
    const orders = columnDayOrders(table, mapping, options.dateFormat);
    const durationUnit = durationUnitFor(mapping.duration !== undefined ? table.headers[mapping.duration] : undefined);
    const splitCategory = mapping.category !== undefined && isPathHeader(table.headers[mapping.category] ?? "");
    const stackCursor = new Map<string, number>();

    return table.rows.map((cells, row) => {
        try {
            const entry = convertRow(cells, {options, orders, durationUnit, splitCategory, stackCursor});
            return {row, entry, error: null};
        } catch (error) {
            const message = error instanceof RowError ? error.message : String(error);
            return {row, entry: null, error: `Row ${row + 1}: ${message}`};
        }
    });
}

class RowError extends Error {}

type RowContext = {
    options: ImportTableOptions;
    orders: Map<number, DayOrder>;
    durationUnit: DurationUnit;
    splitCategory: boolean;
    stackCursor: Map<string, number>;
};

function convertRow(cells: string[], ctx: RowContext): ImportManualEntry {
    const {options} = ctx;
    const {mapping} = options;
    const get = (field: ImportField): string => {
        const index = mapping[field];
        return index === undefined ? "" : (cells[index] ?? "").trim();
    };
    const read = (field: ImportField): DateTimeParts | null => {
        const index = mapping[field];
        const value = get(field);
        if (index === undefined || !value) return null;
        const parts = parseDateTime(value, ctx.orders.get(index) ?? "us");
        if (!parts) throw new RowError(`couldn't read ${FIELD_LABELS[field]} '${value}'`);
        return parts;
    };

    const startDt = read("start_datetime");
    const startDateCell = read("start_date");
    const dateCell = read("date");
    const startTimeCell = read("start_time");
    const endDt = read("end_datetime");
    const endDateCell = read("end_date");
    const endTimeCell = read("end_time");

    const durationText = get("duration");
    let duration: number | null = null;
    if (durationText) {
        duration = parseDuration(durationText, ctx.durationUnit);
        if (duration === null) throw new RowError(`couldn't read duration '${durationText}'`);
    }

    const startDate = startDt?.date ?? startTimeCell?.date ?? startDateCell?.date ?? dateCell?.date ?? null;
    const startTime = startDt?.time ?? startTimeCell?.time ?? startDateCell?.time ?? dateCell?.time ?? null;
    const startOffset = startDt?.offset ?? startTimeCell?.offset ?? startDateCell?.offset ?? null;
    const endDate = endDt?.date ?? endTimeCell?.date ?? endDateCell?.date ?? null;
    const endTime = endDt?.time ?? endTimeCell?.time ?? endDateCell?.time ?? null;
    const endOffset = endDt?.offset ?? endTimeCell?.offset ?? endDateCell?.offset ?? startOffset;

    if (!startDate) {
        if (startTime !== null) throw new RowError("missing start date (only a time was found)");
        throw new RowError("missing start date");
    }

    let start: number;
    let end: number;
    if (startTime !== null) {
        start = toUnix(startDate, startTime, startOffset);
        if (endTime !== null) {
            end = endFor(endDate, endTime, endOffset, startDate, startTime, startOffset, start, duration);
        } else if (duration !== null) {
            end = start + duration;
        } else {
            throw new RowError("missing end time or duration");
        }
    } else if (endTime !== null && duration !== null) {
        end = toUnix(endDate ?? startDate, endTime, endOffset);
        start = end - duration;
    } else if (duration !== null) {
        const key = `${startDate.y}-${startDate.m}-${startDate.d}`;
        start = ctx.stackCursor.get(key) ?? toUnix(startDate, clampHour(options.dayStartHour) * 3600, null);
        end = start + duration;
        if (duration > 0 && duration <= MAX_DURATION_SECONDS) ctx.stackCursor.set(key, end);
    } else {
        throw new RowError(endTime !== null ? "missing start time or duration" : "missing start time");
    }

    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new RowError("couldn't work out the start and end");
    if (end === start) throw new RowError("duration is zero");
    if (end < start) throw new RowError("end is before start");
    if (end - start > MAX_DURATION_SECONDS) throw new RowError("entry is longer than 7 days");

    const {path, titleSuffix} = categoryPath(get("category"), get("subcategory"), get("client"), ctx);
    let title = get("title");
    if (titleSuffix) title = title ? `${title}${SUBCATEGORY_SEPARATOR}${titleSuffix}` : titleSuffix;
    const notes = get("notes");
    return {
        title: truncate(title || "Unnamed", MAX_TITLE_LENGTH),
        notes: notes || null,
        category_path: path,
        start_time: start,
        end_time: end,
    };
}

function endFor(
    endDate: Ymd | null,
    endTime: number,
    endOffset: number | null,
    startDate: Ymd,
    startTime: number,
    startOffset: number | null,
    start: number,
    duration: number | null,
): number {
    if (endDate) return toUnix(endDate, endTime, endOffset);
    // No end date: same day, unless the end time is earlier than the start time (overnight entry).
    const overnight = endOffset === startOffset && endTime < startTime;
    let shift = overnight ? 1 : 0;
    // With a duration column too, pick the day that best matches start + duration (entries over 24h).
    if (duration !== null && duration > 0) {
        const sameDay = toUnix(startDate, endTime, endOffset);
        shift = Math.max(shift, Math.round((start + duration - sameDay) / 86400));
    }
    return toUnix(startDate, endTime, endOffset, shift);
}

const clampHour = (hour: number) => (Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : 9);

/**
 * category_path rules:
 * - "Uncategorized" (any case) in any part → [] (explicitly uncategorized).
 * - client + "as_parent_category": [client, category]; a subcategory would exceed depth 2, so it is
 *   appended to the title as "Title — Task" instead of being dropped.
 * - otherwise [category, subcategory] / [category] / [subcategory].
 * - nothing → options.fallbackCategory.
 * A column headed "Category path" is split on " / ", " > ", "›" or "»".
 */
function categoryPath(categoryValue: string, subcategory: string, client: string, ctx: RowContext): {path: string[]; titleSuffix: string} {
    let category = categoryValue;
    let sub = subcategory;
    if (ctx.splitCategory && category) {
        const parts = category.split(/\s+[/>]\s+|\s*[›»]\s*/).map((p) => p.trim()).filter(Boolean);
        category = parts[0] ?? "";
        if (parts.length > 1) sub = sub ? `${parts.slice(1).join(" / ")}${SUBCATEGORY_SEPARATOR}${sub}` : parts.slice(1).join(" / ");
    }
    const useClient = ctx.options.clientHandling === "as_parent_category" && client !== "";
    let path: string[];
    let titleSuffix = "";
    if (useClient) {
        if (category) {
            path = [client, category];
            titleSuffix = sub;
        } else {
            path = sub ? [client, sub] : [client];
        }
    } else if (category) {
        path = sub ? [category, sub] : [category];
    } else {
        path = sub ? [sub] : [];
    }
    if (path.some((part) => part.toLowerCase() === "uncategorized")) return {path: [], titleSuffix};
    if (!path.length) return {path: ctx.options.fallbackCategory.map((p) => p.trim()).filter(Boolean).slice(0, 2), titleSuffix};
    return {path, titleSuffix};
}

const isPathHeader = (header: string) => ["categorypath", "path", "fullcategory"].includes(normalizeHeader(header));

function durationUnitFor(header: string | undefined): DurationUnit {
    const h = normalizeHeader(header ?? "");
    if (/sec|seconds/.test(h)) return "seconds";
    if (/min/.test(h)) return "minutes";
    return "hours";
}

function truncate(value: string, max: number): string {
    const chars = Array.from(value);
    return chars.length <= max ? value : chars.slice(0, max).join("").trimEnd();
}

/**
 * Day/month order per mapped date column, inferred once per call.
 * Explicit "us" / "eu" options win. For "auto" (and "iso", whose numeric slash dates are still ambiguous):
 * each column is scanned (any first part > 12 → EU, any second part > 12 → US); ambiguous columns take the
 * order decided by the other date columns; if nothing decides, DD.MM.YYYY (dot) columns are EU and the rest US.
 */
export function columnDayOrders(table: ParsedTable, mapping: ColumnMapping, dateFormat: ImportTableOptions["dateFormat"]): Map<number, DayOrder> {
    const columns = [...new Set(DATE_FIELDS.map((f) => mapping[f]).filter((i): i is number => i !== undefined))];
    const result = new Map<number, DayOrder>();
    if (dateFormat === "us" || dateFormat === "eu") {
        for (const column of columns) result.set(column, dateFormat);
        return result;
    }
    const inferred = columns.map((column) => ({column, ...inferDayOrder(table.rows.map((r) => r[column] ?? ""))}));
    const votes = {us: 0, eu: 0};
    for (const info of inferred) if (info.order) votes[info.order]++;
    const pooled: DayOrder | null = votes.eu > votes.us ? "eu" : votes.us > votes.eu ? "us" : null;
    const anyDot = inferred.some((info) => info.dot);
    for (const info of inferred) {
        result.set(info.column, info.order ?? pooled ?? (info.dot || (!info.seen && anyDot) ? "eu" : "us"));
    }
    return result;
}
