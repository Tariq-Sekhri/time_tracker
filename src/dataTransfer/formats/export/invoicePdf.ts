import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ExportFile, ExportOptions} from "../../types.ts";
import {dayKey, formatDate, formatDuration, safeFileStem} from "../shared.ts";
import {invoiceModel} from "./invoice.ts";
import {pdfText} from "./pdf/text.ts";

export async function buildInvoicePdf(dataset: ExportDataset, options: ExportOptions): Promise<ExportFile> {
    const model = invoiceModel(dataset, options);
    const {invoice} = model;
    const priced = model.rateCents !== null;
    const [{jsPDF}, {autoTable}] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({unit: "pt", format: options.pdf.pageSize, orientation: options.pdf.orientation, compress: true});
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = {left: 40, right: 40, top: 48, bottom: 48};
    const accent = options.pdf.accentColor;
    const text = (value: string) => pdfText(value);
    const money = (cents: number | null) => cents == null ? "" : `${invoice.currency} ${(cents / 100).toLocaleString("en-CA", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const styles = {font: "helvetica", fontSize: 9, textColor: [35, 45, 60] as [number, number, number], cellPadding: 8, overflow: "linebreak" as const};
    const lastY = () => (doc as unknown as {lastAutoTable: {finalY: number}}).lastAutoTable.finalY;
    doc.setProperties({title: "Invoice", author: text(options.pdf.preparedBy), creator: "Time Tracker"});
    doc.setFillColor(accent);
    doc.rect(0, 0, width, 7, "F");
    doc.setTextColor(accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("INVOICE", 40, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Hourly services", width - 40, 56, {align: "right"});
    autoTable(doc, {
        startY: 82, margin, theme: "plain", styles,
        head: [["FROM", "BILL TO"]], headStyles: {textColor: accent, fontSize: 8, fontStyle: "bold"},
        body: [[text([options.pdf.preparedBy, invoice.senderDetails].filter(Boolean).join("\n") || "________________________"), text([options.pdf.preparedFor, invoice.clientDetails].filter(Boolean).join("\n") || "________________________")]],
        columnStyles: {0: {cellWidth: (width - 80) / 2}, 1: {cellWidth: (width - 80) / 2}},
    });
    autoTable(doc, {
        startY: lastY() + 12, margin, theme: "plain", styles: {...styles, fontSize: 8},
        head: [["INVOICE NUMBER", "ISSUED", "DUE"]], headStyles: {fillColor: [245, 247, 250], textColor: [90, 100, 115], fontSize: 7},
        body: [[text(invoice.number || "________________"), invoice.issuedOn || "________________", invoice.dueOn || "________________"]],
    });
    const period = `${formatDate(dataset.range_start, options.dateFormat)} to ${formatDate(Math.max(dataset.range_start, dataset.range_end - 1), options.dateFormat)}`;
    autoTable(doc, {
        startY: lastY() + 12, margin, theme: "plain", styles: {...styles, fontSize: 8, cellPadding: {top: 0, bottom: 8, left: 0, right: 0}},
        body: [[`Service period: ${period}`]],
    });
    autoTable(doc, {
        startY: lastY() + 6, margin, theme: "plain", styles, rowPageBreak: "avoid", showHead: "everyPage",
        head: [["DATE / WORK PERFORMED", "HOURS", ...(priced ? ["RATE / HOUR", "AMOUNT"] : [])]],
        headStyles: {fillColor: accent, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold"},
        alternateRowStyles: {fillColor: [247, 249, 252]},
        columnStyles: priced
            ? {1: {halign: "right", cellWidth: 54}, 2: {halign: "right", cellWidth: 96}, 3: {halign: "right", cellWidth: 96}}
            : {1: {halign: "right", cellWidth: 72}},
        body: model.rows.map(({entry, seconds, amountCents}) => [
            text(`${formatDate(entry.start_time, options.dateFormat)}  |  ${entry.title}\n${[entry.parent_category, entry.category].filter(Boolean).join(" / ")}${entry.notes ? `\n${entry.notes}` : ""}`),
            (seconds / 3600).toFixed(4), ...(priced ? [money(model.rateCents), money(amountCents)] : []),
        ]),
    });
    const totals = [
        ["TOTAL TIME", `${formatDuration(model.totalSeconds, "hms")} (${(model.totalSeconds / 3600).toFixed(4)} hours)`],
        ...(priced ? [
            ["SUBTOTAL", money(model.subtotalCents)],
            ...(invoice.taxPercent.trim() ? [[`TAX (${invoice.taxPercent}%)`, money(model.taxCents)]] : []),
            ["TOTAL DUE", money(model.totalCents)],
        ] : []),
    ];
    autoTable(doc, {
        startY: lastY() + 16, margin: {...margin, left: Math.max(40, width - 360)}, theme: "plain", pageBreak: "avoid",
        styles: {...styles, fontSize: 9}, body: totals,
        columnStyles: {0: {fontStyle: "bold"}, 1: {halign: "right"}},
        didParseCell: data => {if (data.row.index === totals.length - 1) {data.cell.styles.fillColor = [238, 243, 250]; data.cell.styles.fontStyle = "bold";}},
    });
    if (priced || invoice.paymentTerms.trim()) autoTable(doc, {
        startY: lastY() + 18, margin, theme: "plain", styles: {...styles, fontSize: 8},
        body: [
            ...(invoice.paymentTerms.trim() ? [["PAYMENT DETAILS / TERMS"], [text(invoice.paymentTerms)]] : []),
            ...(priced ? [["Amounts are rounded per line to two decimal places. Total time uses the selected duration rounding."]] : []),
        ],
    });
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setDrawColor(225, 230, 237);
        doc.line(40, height - 32, width - 40, height - 32);
        doc.setTextColor(110);
        doc.setFontSize(8);
        doc.text(text(invoice.number ? `Invoice ${invoice.number}` : "Time Tracker"), 40, height - 18, {maxWidth: width - 170});
        doc.text(`${page} / ${pages}`, width - 40, height - 18, {align: "right"});
    }
    return {fileName: `invoice-${safeFileStem(invoice.number || dayKey(dataset.range_start))}.pdf`, mimeType: "application/pdf", bytes: new Uint8Array(doc.output("arraybuffer"))};
}
