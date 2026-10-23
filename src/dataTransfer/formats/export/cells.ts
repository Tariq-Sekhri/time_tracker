import type {DateFormat, DurationFormat, ExportOptions, TimeFormat} from "../../types.ts";
import {formatDate, formatDuration} from "../shared.ts";

/*
 * Typed cell values. Column getters produce these; CSV turns them into text using the
 * user's options (or a fixed format a framework requires) and Excel writes real
 * numbers / dates with matching number formats.
 */

export type Cell =
    | {kind: "text"; value: string}
    | {kind: "number"; value: number; decimals?: number}
    /** Seconds. `format` overrides options.durationFormat; `padHours` gives "01:05:00". */
    | {kind: "duration"; seconds: number; format?: DurationFormat; padHours?: boolean}
    /** Local calendar date of a unix timestamp. */
    | {kind: "date"; ts: number; format?: DateFormat}
    /** Local wall-clock time of a unix timestamp. */
    | {kind: "time"; ts: number; format?: TimeFormat; seconds?: boolean; padHours?: boolean}
    | {kind: "datetime"; ts: number}
    | {kind: "bool"; value: boolean}
    /** Hex color; Excel fills the cell with it. */
    | {kind: "color"; value: string | null}
    | {kind: "empty"};

export const text = (value: string | null | undefined): Cell =>
    value === null || value === undefined || value === "" ? {kind: "empty"} : {kind: "text", value};
export const num = (value: number, decimals?: number): Cell => ({kind: "number", value, decimals});
export const bool = (value: boolean): Cell => ({kind: "bool", value});
export const EMPTY: Cell = {kind: "empty"};

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Duration text honoring a format, optionally with zero-padded hours ("01:30:00"). */
export function durationText(seconds: number, format: DurationFormat, padHours = false): string {
    const formatted = formatDuration(seconds, format);
    if (!padHours || format === "decimal") return formatted;
    const [hours, ...rest] = formatted.split(":");
    return [hours.padStart(2, "0"), ...rest].join(":");
}

/** Local time text: 24h "13:05[:09]" or 12h "1:05[:09] PM" ("01:05 PM" when padHours). */
export function timeText(ts: number, format: TimeFormat, seconds = true, padHours = format === "24h"): string {
    const date = new Date(ts * 1000);
    const h24 = date.getHours();
    const hours = format === "12h" ? h24 % 12 || 12 : h24;
    const hourText = padHours ? pad2(hours) : String(hours);
    const clock = `${hourText}:${pad2(date.getMinutes())}${seconds ? `:${pad2(date.getSeconds())}` : ""}`;
    return format === "12h" ? `${clock} ${h24 < 12 ? "AM" : "PM"}` : clock;
}

/** Plain text of a cell for CSV and width estimates. */
export function cellText(cell: Cell, options: ExportOptions): string {
    switch (cell.kind) {
        case "text":
            return cell.value;
        case "number":
            return cell.decimals === undefined ? String(cell.value) : cell.value.toFixed(cell.decimals);
        case "duration":
            return durationText(cell.seconds, cell.format ?? options.durationFormat, cell.padHours);
        case "date":
            return formatDate(cell.ts, cell.format ?? options.dateFormat);
        case "time":
            return timeText(cell.ts, cell.format ?? options.timeFormat, cell.seconds ?? true, cell.padHours);
        case "datetime":
            return `${formatDate(cell.ts, options.dateFormat)} ${timeText(cell.ts, options.timeFormat)}`;
        case "bool":
            return cell.value ? "Yes" : "No";
        case "color":
            return cell.value ?? "";
        case "empty":
            return "";
    }
}

/** Raw value used for sorting/totals: seconds for durations, numbers as-is. */
export function cellSeconds(cell: Cell): number {
    if (cell.kind === "duration") return cell.seconds;
    if (cell.kind === "number") return cell.value;
    return 0;
}
