import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {buildPdfReport} from "../src/dataTransfer/formats/export/pdf.ts";
import {entry, local, sampleDataset, options} from "../src/dataTransfer/formats/export/fixtures.ts";
import {DEFAULT_INVOICE} from "../src/dataTransfer/formats/export/invoice.ts";
const dir = join(tmpdir(), "time-tracker-invoice-review");
mkdirSync(dir, {recursive: true});
const base = options();
base.format = "pdf";
base.pdf = {...base.pdf, layout: "invoice", preparedBy: "Northwind Studio", preparedFor: "Acme Corporation", invoice: {...DEFAULT_INVOICE, number: "INV-2026-042", issuedOn: "2026-03-31", dueOn: "2026-04-30", hourlyRate: "125", taxPercent: "13", senderDetails: "123 King Street\nToronto, ON M5V 1J2\naccounts@example.com\nTax ID: 123456789 RT0001", clientDetails: "Finance Department\n456 Front Street\nToronto, ON M5J 2N8", paymentTerms: "Payment due within 30 days. Please use the invoice number as your payment reference.\nPayment instructions: billing@example.com"}};
for (const name of ["priced", "unpriced", "multipage"]) {
 const dataset = sampleDataset();
 dataset.manual_entries = dataset.manual_entries.filter(row => row.category_id === 2);
 const settings = structuredClone(base);
 if (name === "unpriced") settings.pdf.invoice!.hourlyRate = "";
 if (name === "multipage") dataset.manual_entries = Array.from({length: 55}, (_, id) => {
  const start = local(2026, 3, 1 + id % 28, 9);
  return entry({id, title: `Website implementation and review - milestone ${id + 1}`, notes: "Implementation, accessibility review, automated checks, and client feedback incorporated into the final deliverable.", start_time: start, end_time: start + 5400});
 });
 writeFileSync(join(dir, `${name}.pdf`), (await buildPdfReport(dataset, settings)).bytes);
}
console.log(dir);
