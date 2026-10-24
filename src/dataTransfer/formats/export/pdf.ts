import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ExportFile, ExportOptions} from "../../types.ts";
import {dayKey, safeFileStem} from "../shared.ts";
import {drawActivityDetail, drawManualDetail} from "./pdf/detail.ts";
import type {Ctx} from "./pdf/layout.ts";
import {buildReportModel} from "./pdf/model.ts";
import {drawMetadataDetail, hasMetadata} from "./pdf/metadata.ts";
import {
    drawCategoryBreakdown,
    drawCoverHeader,
    drawDailyBreakdown,
    drawDeviceBreakdown,
    drawEmptyState,
    drawOverview,
    drawPageChrome,
    drawSignature,
    reportTitle,
} from "./pdf/sections.ts";
import {pdfLine} from "./pdf/text.ts";
import {makeTheme} from "./pdf/theme.ts";

/** "<title>-2026-03-01_to_2026-03-31.pdf" */
export function pdfFileName(dataset: ExportDataset, options: ExportOptions): string {
    const end = Math.max(dataset.range_start, dataset.range_end - 1);
    return `${safeFileStem(options.pdf.title || "time report")}-${dayKey(dataset.range_start)}_to_${dayKey(end)}.pdf`;
}

/**
 * Builds the PDF time report. jsPDF and jspdf-autotable are imported on demand so they stay out of
 * the main bundle.
 */
export async function buildPdfReport(dataset: ExportDataset, options: ExportOptions): Promise<ExportFile> {
    if (options.pdf.layout === "invoice") {
        const {buildInvoicePdf} = await import("./invoicePdf.ts");
        return buildInvoicePdf(dataset, options);
    }
    const [{jsPDF}, {autoTable}] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const pdf = options.pdf;
    const doc = new jsPDF({
        orientation: pdf.orientation === "landscape" ? "landscape" : "portrait",
        unit: "pt",
        format: pdf.pageSize === "letter" ? "letter" : "a4",
        compress: true,
    });

    const theme = makeTheme(pdf.accentColor);
    const model = buildReportModel(dataset, options, theme);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const side = pdf.orientation === "landscape" ? 42 : 40;
    const margin = {left: side, right: side, top: 58, bottom: 50};
    const ctx: Ctx = {
        doc,
        autoTable,
        theme,
        options,
        model,
        pageWidth,
        pageHeight,
        margin,
        contentWidth: pageWidth - margin.left - margin.right,
        y: margin.top,
    };

    const title = reportTitle(ctx);
    doc.setProperties({
        title,
        subject: `Time report ${dayKey(model.rangeStart)} to ${dayKey(Math.max(model.rangeStart, model.rangeEnd - 1))}`,
        author: pdfLine(pdf.preparedBy),
        creator: "Time Tracker",
        keywords: "time report, timesheet",
    });

    drawCoverHeader(ctx, dataset.generated_at || Math.floor(Date.now() / 1000));

    const sections = pdf.sections;
    if (model.totals.total <= 0 && !model.hasManual && !model.hasActivity) {
        if (hasMetadata(dataset)) drawMetadataDetail(ctx, dataset);
        else drawEmptyState(ctx);
    } else {
        if (sections.overview) drawOverview(ctx);
        if (sections.categoryBreakdown) drawCategoryBreakdown(ctx);
        if (sections.dailyBreakdown) drawDailyBreakdown(ctx);
        if (sections.deviceBreakdown && model.hasActivity) drawDeviceBreakdown(ctx);
        if (sections.detail) {
            drawMetadataDetail(ctx, dataset);
            drawManualDetail(ctx);
            drawActivityDetail(ctx);
        }
        if (sections.signature) drawSignature(ctx);
    }

    drawPageChrome(ctx, dataset.app_version);

    const bytes = new Uint8Array(doc.output("arraybuffer"));
    return {fileName: pdfFileName(dataset, options), mimeType: "application/pdf", bytes};
}
