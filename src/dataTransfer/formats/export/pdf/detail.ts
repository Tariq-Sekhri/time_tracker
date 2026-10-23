import type {CellDef, CellHookData, RowInput} from "jspdf-autotable";
import type {SummaryGrouping} from "../../../types.ts";
import {formatDate, formatDuration, humanDuration} from "../../shared.ts";
import {afterTable, eyebrow, fill, font, sectionHeading, tableStyle, width, type Ctx} from "./layout.ts";
import {groupRows, type ActivityRow, type ManualRow, type RowGroup} from "./model.ts";
import {dayLabel, pdfLine, pdfText, shortTime} from "./text.ts";
import {INK, OTHER_GRAY, SURFACE, mix, type Rgb} from "./theme.ts";

export const MAX_LOG_ROWS = 5000;
const MAX_NOTES_CHARS = 600;

type Column<T> = {
    header: string;
    width: number | "auto";
    align?: "right";
    value: (row: T) => string;
    /** Draws a color dot before the text. */
    dot?: (row: T) => Rgb | null;
    muted?: boolean;
};

type RowMeta<T> =
    | {kind: "group"; label: string; count: string}
    | {kind: "item"; row: T; stripe: boolean; title?: string; notes?: string};

/**
 * One autoTable with optional group header rows. Group headers are kept together with the first
 * row of their group, headers repeat on every page, and the grand total sits in the table foot.
 */
function drawGroupedTable<T extends {start: number; seconds: number}>(
    ctx: Ctx,
    rows: T[],
    columns: Column<T>[],
    grouping: SummaryGrouping,
    groupLabel: (grouping: SummaryGrouping, row: T) => string | null,
    noun: [string, string],
    notesFor?: (row: T) => {titleColumn: number; title: string; notes: string} | null,
    reserveApproval = false,
) {
    const {options, theme} = ctx;
    const fmt = (s: number) => formatDuration(s, options.durationFormat);
    const groups: RowGroup<T>[] = groupRows(rows, grouping, groupLabel);
    const grouped = groups.length > 1 || (groups[0] && groups[0].label !== "");
    const durationColumn = columns.length - 1;

    const meta: RowMeta<T>[] = [];
    const body: RowInput[] = [];
    for (const group of groups) {
        if (grouped) {
            const count = `${group.rows.length} ${group.rows.length === 1 ? noun[0] : noun[1]}`;
            meta.push({kind: "group", label: pdfLine(group.label), count});
            body.push([{content: pdfLine(group.label), colSpan: columns.length - 1} as CellDef, fmt(group.seconds)]);
        }
        group.rows.forEach((row, index) => {
            const notes = notesFor?.(row) ?? null;
            meta.push({kind: "item", row, stripe: index % 2 === 1, title: notes?.title, notes: notes?.notes});
            body.push(
                columns.map((column, columnIndex) =>
                    notes && notes.notes && columnIndex === notes.titleColumn ? `${notes.title}\n${notes.notes}` : column.value(row),
                ),
            );
        });
    }

    const total = groups.reduce((sum, group) => sum + group.seconds, 0);
    const groupFill = mix(theme.accentWash, [255, 255, 255], 0.35);
    const style = tableStyle(ctx);
    const pad = 6;

    ctx.autoTable(ctx.doc, {
        ...style,
        startY: ctx.y,
        head: [columns.map(column => column.header.toUpperCase())],
        body,
        foot: [
            [
                {content: `Total · ${rows.length} ${rows.length === 1 ? noun[0] : noun[1]}`, colSpan: columns.length - 1} as CellDef,
                fmt(total),
            ],
        ],
        columnStyles: Object.fromEntries(
            columns.map((column, index) => [index, {cellWidth: column.width, halign: column.align ?? "left"}]),
        ),
        didParseCell: (data: CellHookData) => {
            const column = columns[data.column.index];
            if (column?.align === "right" || data.column.index === durationColumn) data.cell.styles.halign = "right";
            if (data.section === "head" && data.column.index === durationColumn) data.cell.styles.halign = "right";
            if (data.section === "foot" && data.column.index === durationColumn) data.cell.styles.halign = "right";
            if (data.section !== "body") return;
            if (reserveApproval && data.column.index === 0 && data.row.index === meta.length - 1) {
                // Move the final entry and its total with the approval block, instead of
                // leaving an otherwise empty signature page at the end of the report.
                const original = data.row.canEntireRowFit.bind(data.row);
                data.row.canEntireRowFit = (height, tableColumns) => original(height - 124, tableColumns);
            }
            const m = meta[data.row.index];
            if (m.kind === "group") {
                data.cell.styles.fillColor = groupFill;
                data.cell.styles.fontStyle = "bold";
                data.cell.styles.fontSize = 8.3;
                data.cell.styles.cellPadding = {top: 7, bottom: 6, left: pad, right: pad};
                data.cell.styles.lineWidth = {top: 0.6, bottom: 0.4};
                data.cell.styles.lineColor = theme.accentSoft;
                data.cell.styles.valign = "middle";
                if (data.column.index === 0) keepWithNext(data);
                return;
            }
            data.cell.styles.fillColor = m.stripe ? SURFACE.zebra : false;
            if (column?.muted) data.cell.styles.textColor = INK.secondary;
            if (column?.dot) data.cell.styles.cellPadding = {top: 4.6, bottom: 4.6, left: pad + 9, right: pad};
            if (data.column.index === durationColumn) data.cell.styles.fontStyle = "bold";
        },
        willDrawCell: (data: CellHookData) => {
            if (data.section !== "body") return;
            const m = meta[data.row.index];
            if (m.kind !== "item" || !m.notes || !m.title) return;
            const notes = notesFor?.(m.row);
            if (!notes || data.column.index !== notes.titleColumn) return;
            // Draw only the title lines here; the notes are drawn smaller and muted in didDrawCell.
            const available = data.cell.width - data.cell.padding("horizontal") + 1;
            const titleLines = ctx.doc.splitTextToSize(m.title, available) as string[];
            data.cell.text = titleLines;
        },
        didDrawCell: (data: CellHookData) => {
            if (data.section === "body") {
                const m = meta[data.row.index];
                const column = columns[data.column.index];
                if (m.kind === "group" && data.column.index === 0) {
                    font(ctx, 8.3, "bold");
                    const labelWidth = width(ctx, m.label);
                    font(ctx, 7.3, "normal", INK.muted);
                    const textY = data.cell.y + data.cell.height / 2 + 2.6;
                    ctx.doc.text(m.count, data.cell.x + pad + labelWidth + 8, textY);
                    return;
                }
                if (m.kind === "item") {
                    if (column?.dot) {
                        fill(ctx, column.dot(m.row) ?? OTHER_GRAY);
                        ctx.doc.circle(data.cell.x + pad + 2.6, data.cell.y + 4.6 + 3.6, 2.3, "F");
                    }
                    const notes = notesFor?.(m.row);
                    if (notes && notes.notes && data.column.index === notes.titleColumn) {
                        const lineHeight = 8 * 1.15;
                        const top = data.cell.y + data.cell.padding("top") + data.cell.text.length * lineHeight + 1.2;
                        font(ctx, 7.2, "italic", INK.muted);
                        const available = data.cell.width - data.cell.padding("horizontal");
                        const lines = ctx.doc.splitTextToSize(notes.notes, available) as string[];
                        ctx.doc.text(lines, data.cell.x + data.cell.padding("left"), top, {baseline: "top", lineHeightFactor: 1.2});
                    }
                }
            }
        },
    });
    afterTable(ctx);
}

/** Makes autoTable move a group header to the next page when its first row would not fit with it. */
function keepWithNext(data: CellHookData) {
    const row = data.row;
    const table = data.table;
    const original = row.canEntireRowFit.bind(row);
    row.canEntireRowFit = (height, columns) => {
        const next = table.body[row.index + 1];
        return original(height - (next ? Math.min(next.height, 80) : 0), columns);
    };
}

function groupLabelFor(ctx: Ctx, kind: "manual" | "activity") {
    const dateFormat = ctx.options.dateFormat;
    return (grouping: SummaryGrouping, row: ManualRow | ActivityRow): string | null => {
        switch (grouping) {
            case "day":
                return dayLabel(row.start, dateFormat);
            case "week": {
                const date = new Date(row.start * 1000);
                const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
                return `Week of ${formatDate(monday.getTime() / 1000, dateFormat)}`;
            }
            case "category":
                return kind === "manual" ? manualCategoryLabel(row as ManualRow) : (row as ActivityRow).category;
            case "device":
                return kind === "manual" ? null : (row as ActivityRow).device;
            default:
                return null;
        }
    };
}

export function manualCategoryLabel(row: ManualRow): string {
    return row.parent ? `${row.parent} › ${row.category}` : row.category;
}

/* ------------------------------------------------------------------ manual */

export function drawManualDetail(ctx: Ctx) {
    const {model, options} = ctx;
    if (!model.manual.length) return;
    const grouping = options.summaryGrouping === "device" ? "none" : options.summaryGrouping;
    const time = (ts: number) => shortTime(ts, options.timeFormat);
    const timeWidth = options.timeFormat === "12h" ? 48 : 38;

    const columns: Column<ManualRow>[] = [];
    if (grouping !== "day") columns.push({header: "Date", width: options.dateFormat === "iso" ? 60 : 58, value: r => formatDate(r.start, options.dateFormat)});
    columns.push({header: "Start", width: timeWidth, value: r => time(r.start), muted: true});
    columns.push({header: "End", width: timeWidth, value: r => time(r.end), muted: true});
    const titleColumn = columns.length;
    columns.push({header: "Title", width: "auto", value: r => pdfText(r.title) || "(untitled)"});
    if (grouping !== "category") {
        columns.push({
            header: "Category",
            width: Math.min(130, Math.max(96, ctx.contentWidth * 0.2)),
            value: r => pdfLine(manualCategoryLabel(r)),
            dot: r => r.color,
        });
    }
    columns.push({header: "Duration", width: options.durationFormat === "hms" ? 56 : 52, align: "right", value: r => formatDuration(r.seconds, options.durationFormat)});

    const {totals} = model;
    sectionHeading(ctx, "Manual entries", `${totals.manualEntries} ${totals.manualEntries === 1 ? "entry" : "entries"} · ${humanDuration(totals.manual)}`, 80);
    drawGroupedTable(ctx, model.manual, columns, grouping, groupLabelFor(ctx, "manual"), ["entry", "entries"], row => {
        if (!row.notes) return null;
        const notes = pdfText(row.notes);
        return {
            titleColumn,
            title: pdfText(row.title) || "(untitled)",
            notes: notes.length > MAX_NOTES_CHARS ? `${notes.slice(0, MAX_NOTES_CHARS).trimEnd()}…` : notes,
        };
    }, options.pdf.sections.signature && !model.hasActivity);
}

/* ---------------------------------------------------------------- activity */

export function topApps(row: ActivityRow, limit = 3): string {
    const apps = [...row.apps].sort((a, b) => b.duration - a.duration).slice(0, limit);
    const text = apps.map(app => `${pdfLine(app.app) || "?"} (${humanDuration(app.duration)})`).join(", ");
    const rest = row.apps.length - apps.length;
    return rest > 0 ? `${text} +${rest} more` : text;
}

export function drawActivityDetail(ctx: Ctx) {
    const {model, options} = ctx;
    if (!model.activity.length) return;
    const grouping = options.summaryGrouping;
    const time = (ts: number) => shortTime(ts, options.timeFormat);
    const timeWidth = options.timeFormat === "12h" ? 48 : 38;
    const logs = model.activitySource === "logs";
    const rows = logs ? model.activity.slice(0, MAX_LOG_ROWS) : model.activity;

    const columns: Column<ActivityRow>[] = [];
    if (grouping !== "day") columns.push({header: "Date", width: 60, value: r => formatDate(r.start, options.dateFormat)});
    if (logs) {
        columns.push({header: "Time", width: timeWidth, value: r => time(r.start), muted: true});
    } else {
        columns.push({header: "Start", width: timeWidth, value: r => time(r.start), muted: true});
        columns.push({header: "End", width: timeWidth, value: r => time(r.end), muted: true});
    }
    if (grouping !== "device") columns.push({header: "Device", width: Math.min(96, ctx.contentWidth * 0.16), value: r => pdfLine(r.device)});
    if (grouping !== "category") {
        columns.push({header: "Category", width: Math.min(104, ctx.contentWidth * 0.18), value: r => pdfLine(r.category), dot: r => categoryColor(ctx, r)});
    }
    columns.push({header: logs ? "App" : "Top apps", width: "auto", value: r => (logs ? pdfLine(r.apps[0]?.app) : topApps(r)), muted: !logs});
    columns.push({header: "Duration", width: options.durationFormat === "hms" ? 56 : 52, align: "right", value: r => formatDuration(r.seconds, options.durationFormat)});

    const {totals} = model;
    const noun: [string, string] = logs ? ["log row", "log rows"] : ["session", "sessions"];
    const devices = model.devices.length;
    sectionHeading(
        ctx,
        logs ? "Activity log" : "Activity sessions",
        `${totals.activityItems} ${totals.activityItems === 1 ? noun[0] : noun[1]} · ${devices} ${devices === 1 ? "device" : "devices"} · ${humanDuration(totals.activity)}`,
        80,
    );
    if (logs && model.activity.length > MAX_LOG_ROWS) {
        font(ctx, 7.5, "italic", INK.muted);
        ctx.doc.text(`Showing first ${MAX_LOG_ROWS.toLocaleString("en-US")} of ${model.activity.length.toLocaleString("en-US")} log rows. Totals above include every row.`, ctx.margin.left, ctx.y + 2);
        ctx.y += 12;
    }
    drawGroupedTable(ctx, rows, columns, grouping, groupLabelFor(ctx, "activity"), noun, undefined, options.pdf.sections.signature);
}

function categoryColor(ctx: Ctx, row: ActivityRow): Rgb | null {
    return row.color ?? ctx.model.categories.find(c => c.type === "activity" && c.name === row.category)?.color ?? null;
}

void eyebrow;
