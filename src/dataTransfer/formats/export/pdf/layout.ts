import type {jsPDF} from "jspdf";
import type {autoTable as AutoTableFn, CellHookData, UserOptions} from "jspdf-autotable";
import type {ExportOptions} from "../../../types.ts";
import type {ReportModel} from "./model.ts";
import {INK, SURFACE, type Rgb, type Theme} from "./theme.ts";

/** Drawing context shared by every section. Units are points. */
export type Ctx = {
    doc: jsPDF;
    autoTable: typeof AutoTableFn;
    theme: Theme;
    options: ExportOptions;
    model: ReportModel;
    pageWidth: number;
    pageHeight: number;
    margin: {left: number; right: number; top: number; bottom: number};
    contentWidth: number;
    /** Current vertical cursor. */
    y: number;
};

export const FONT = "helvetica";

export const fill = (ctx: Ctx, color: Rgb) => ctx.doc.setFillColor(color[0], color[1], color[2]);
export const stroke = (ctx: Ctx, color: Rgb) => ctx.doc.setDrawColor(color[0], color[1], color[2]);
export const ink = (ctx: Ctx, color: Rgb) => ctx.doc.setTextColor(color[0], color[1], color[2]);

export function font(ctx: Ctx, size: number, style: "normal" | "bold" | "italic" = "normal", color: Rgb = INK.primary) {
    ctx.doc.setFont(FONT, style);
    ctx.doc.setFontSize(size);
    ink(ctx, color);
}

/** Text width in points for the current font. */
export const width = (ctx: Ctx, text: string) => ctx.doc.getTextWidth(text);

/** Truncates with an ellipsis so the text fits `max` points in the current font. */
export function fit(ctx: Ctx, text: string, max: number): string {
    if (width(ctx, text) <= max) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (width(ctx, text.slice(0, mid).trimEnd() + "…") <= max) lo = mid;
        else hi = mid - 1;
    }
    return lo ? text.slice(0, lo).trimEnd() + "…" : "…";
}

/** Uppercase label with a little tracking (left-aligned only; jsPDF's charSpace breaks alignment). */
export function eyebrow(ctx: Ctx, text: string, x: number, y: number, color: Rgb = INK.muted, size = 6.8) {
    font(ctx, size, "bold", color);
    ctx.doc.text(text.toUpperCase(), x, y, {charSpace: 0.55});
}

export function hairline(ctx: Ctx, x1: number, y: number, x2: number, color: Rgb = SURFACE.hairline, lineWidth = 0.6) {
    stroke(ctx, color);
    ctx.doc.setLineWidth(lineWidth);
    ctx.doc.line(x1, y, x2, y);
}

export const bottomLimit = (ctx: Ctx) => ctx.pageHeight - ctx.margin.bottom;

export function newPage(ctx: Ctx) {
    ctx.doc.addPage();
    ctx.y = ctx.margin.top;
}

/** Starts a new page unless `height` points still fit below the cursor. */
export function ensureSpace(ctx: Ctx, height: number) {
    if (ctx.y + height > bottomLimit(ctx)) newPage(ctx);
}

/**
 * Section heading: title left, optional note right, hairline under it. `keepWith` reserves room for
 * the content that must follow on the same page so headings are never orphaned.
 */
export function sectionHeading(ctx: Ctx, title: string, note = "", keepWith = 60) {
    if (ctx.y > ctx.margin.top + 1) ctx.y += 26;
    ensureSpace(ctx, 26 + keepWith);
    const {left} = ctx.margin;
    const right = ctx.pageWidth - ctx.margin.right;
    fill(ctx, ctx.theme.accent);
    ctx.doc.rect(left, ctx.y + 1.5, 2.5, 10, "F");
    font(ctx, 11.5, "bold");
    ctx.doc.text(title, left + 9, ctx.y + 10.5);
    if (note) {
        font(ctx, 8, "normal", INK.muted);
        ctx.doc.text(fit(ctx, note, ctx.contentWidth - width(ctx, title) - 40), right, ctx.y + 10.5, {align: "right"});
    }
    ctx.y += 18;
    hairline(ctx, left, ctx.y, right);
    ctx.y += 12;
}

/** Rounded only at the top (columns) or right (bars); the baseline end stays square. */
export function roundedBar(ctx: Ctx, x: number, y: number, w: number, h: number, radius: number, end: "top" | "right") {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    if (r < 0.5) {
        ctx.doc.rect(x, y, w, h, "F");
        return;
    }
    ctx.doc.roundedRect(x, y, w, h, r, r, "F");
    if (end === "top") ctx.doc.rect(x, y + h - r, w, r, "F");
    else ctx.doc.rect(x, y, r, h, "F");
}

/** Shared look for every autoTable in the report. */
export function tableStyle(ctx: Ctx): UserOptions {
    const {theme} = ctx;
    return {
        theme: "plain",
        margin: {left: ctx.margin.left, right: ctx.margin.right, top: ctx.margin.top, bottom: ctx.margin.bottom},
        tableWidth: ctx.contentWidth,
        showHead: "everyPage",
        showFoot: "lastPage",
        rowPageBreak: "avoid",
        styles: {
            font: FONT,
            fontSize: 8,
            textColor: INK.primary,
            cellPadding: {top: 4.6, bottom: 4.6, left: 6, right: 6},
            lineColor: SURFACE.hairline,
            lineWidth: {bottom: 0.4},
            overflow: "linebreak",
            valign: "top",
        },
        headStyles: {
            fillColor: theme.accentWash,
            textColor: theme.accentInk,
            fontStyle: "bold",
            fontSize: 7,
            lineWidth: 0,
            cellPadding: {top: 6, bottom: 6, left: 6, right: 6},
            valign: "middle",
        },
        footStyles: {
            fillColor: false,
            textColor: INK.primary,
            fontStyle: "bold",
            fontSize: 8.5,
            lineColor: theme.accent,
            lineWidth: {top: 0.9},
            cellPadding: {top: 6, bottom: 6, left: 6, right: 6},
        },
    };
}

type GuardedRow = {__guarded?: boolean; __deferred?: boolean};

/**
 * Keeps a body row on the same page as the `following` rows after it (and the table foot when
 * `withFoot`). Used for group headers, the first rows under the table head, and the last rows above
 * the total, so no page starts or ends with a lone row. Call from didParseCell.
 * A row is only deferred once, so oversized rows can never loop forever.
 */
export function keepWithNext(data: CellHookData, following: number, withFoot = false) {
    const row = data.row as CellHookData["row"] & GuardedRow;
    if (row.__guarded) return;
    row.__guarded = true;
    const table = data.table;
    const original = row.canEntireRowFit.bind(row);
    row.canEntireRowFit = (height, columns) => {
        if (row.__deferred) return original(height, columns);
        let extra = 0;
        for (let i = 1; i <= following; i++) {
            const next = table.body[row.index + i];
            if (next) extra += Math.min(next.height, 90);
        }
        if (withFoot) extra += table.getFootHeight(table.columns);
        const fits = original(height - extra, columns);
        if (!fits && original(height, columns)) row.__deferred = true;
        return fits;
    };
}

/** Standard widow/orphan control for a table body: 2+ rows after the head, 2+ rows before the total. */
export function guardTableRows(data: CellHookData) {
    if (data.section !== "body" || data.column.index !== 0) return;
    const count = data.table.body.length;
    if (count < 4) {
        if (data.row.index === 0) keepWithNext(data, count - 1, true);
        return;
    }
    if (data.row.index === 0) keepWithNext(data, 1);
    if (data.row.index === count - 2) keepWithNext(data, 1, true);
}

/** Largest font size (from `max` down to `min`) at which `text` fits in `maxWidth`. */
export function fitFontSize(ctx: Ctx, text: string, maxWidth: number, max: number, min: number, style: "normal" | "bold" = "bold"): number {
    ctx.doc.setFont(FONT, style);
    for (let size = max; size > min; size -= 0.5) {
        ctx.doc.setFontSize(size);
        if (width(ctx, text) <= maxWidth) return size;
    }
    return min;
}

/** Moves the cursor below the last autoTable. */
export function afterTable(ctx: Ctx) {
    const last = (ctx.doc as unknown as {lastAutoTable?: {finalY?: number}}).lastAutoTable;
    ctx.y = last?.finalY ?? ctx.y;
}
