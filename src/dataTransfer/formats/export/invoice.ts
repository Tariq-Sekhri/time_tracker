import type {ExportDataset} from "../../../api/dataTransfer.ts";
import type {ExportOptions, InvoiceOptions} from "../../types.ts";
import {roundDuration} from "../shared.ts";

export const DEFAULT_INVOICE: InvoiceOptions = {
    number: "", issuedOn: "", dueOn: "", hourlyRate: "", currency: "CAD", taxPercent: "",
    senderDetails: "", clientDetails: "", paymentTerms: "",
};
export const INVOICE_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD"] as const;
const decimal = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim());
const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4))
        && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8));
};
export function invoiceErrors(invoice: InvoiceOptions): string[] {
    const errors: string[] = [];
    if (invoice.hourlyRate.trim() && (!decimal(invoice.hourlyRate) || Number(invoice.hourlyRate) > 1_000_000)) errors.push("Use an hourly rate from 0 to 1,000,000, with up to two decimal places, or leave it blank.");
    if (invoice.taxPercent.trim() && (!decimal(invoice.taxPercent) || Number(invoice.taxPercent) > 100)) errors.push("Use a tax percentage from 0 to 100, or leave it blank.");
    if (!INVOICE_CURRENCIES.includes(invoice.currency)) errors.push("Choose a supported invoice currency.");
    for (const [name, value] of [["Issue date", invoice.issuedOn], ["Due date", invoice.dueOn]]) {
        if (value && !validDate(value)) errors.push(`${name} must be a valid date.`);
    }
    if (invoice.issuedOn && invoice.dueOn && invoice.dueOn < invoice.issuedOn) errors.push("Due date must be on or after the issue date.");
    return errors;
}
export function invoiceModel(dataset: ExportDataset, options: ExportOptions) {
    const invoice = {...DEFAULT_INVOICE, ...options.pdf.invoice};
    const errors = invoiceErrors(invoice);
    if (errors.length) throw new Error(errors.join(" "));
    const rateCents = invoice.hourlyRate.trim() === "" ? null : Math.round(Number(invoice.hourlyRate) * 100);
    const rows = [...dataset.manual_entries].sort((a, b) => a.start_time - b.start_time || a.id - b.id).map(entry => {
        const seconds = roundDuration(entry.end_time - entry.start_time, options.rounding, options.roundingMode);
        return {entry, seconds, amountCents: rateCents == null ? null : Math.round(seconds * rateCents / 3600)};
    });
    const subtotalCents = rateCents == null ? null : rows.reduce((sum, row) => sum + row.amountCents!, 0);
    const taxCents = subtotalCents == null ? null : Math.round(subtotalCents * Number(invoice.taxPercent || 0) / 100);
    return {invoice, rows, rateCents, totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0), subtotalCents, taxCents, totalCents: subtotalCents == null ? null : subtotalCents + taxCents!};
}
