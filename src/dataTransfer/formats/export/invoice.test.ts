import {describe, expect, it} from "vitest";
import {DEFAULT_INVOICE, invoiceErrors, invoiceModel} from "./invoice.ts";
import {entry, local, options, sampleDataset} from "./fixtures.ts";
import {deserializeSettings, serializeSettings} from "../../ui/presets.ts";
import {builtInExportPresets} from "../../ui/builtInPresets.ts";

describe("hourly invoice", () => {
    const invoiceOptions = (hourlyRate = "") => {
        const base = options();
        return {...base, format: "pdf" as const, pdf: {...base.pdf, layout: "invoice" as const, invoice: {...DEFAULT_INVOICE, hourlyRate}}};
    };
    it("leaves money blank without a rate, while zero is a real explicit rate", () => {
        const blank = invoiceModel(sampleDataset(), invoiceOptions());
        expect(blank.totalSeconds).toBe(8820);
        expect(blank.rateCents).toBeNull();
        expect(blank.subtotalCents).toBeNull();
        expect(blank.taxCents).toBeNull();
        expect(blank.totalCents).toBeNull();
        expect(blank.rows.every(row => row.amountCents === null)).toBe(true);
        expect(invoiceModel(sampleDataset(), invoiceOptions("0")).totalCents).toBe(0);
    });
    it("calculates line cents from exact time and totals the rounded lines before tax", () => {
        const dataset = sampleDataset();
        const start = local(2026, 3, 1, 9);
        dataset.manual_entries = [1, 2, 3].map(id => entry({id, start_time: start, end_time: start + 60}));
        const settings = invoiceOptions("10");
        settings.pdf.invoice.taxPercent = "13";
        const result = invoiceModel(dataset, settings);
        expect(result.rows.map(row => row.amountCents)).toEqual([17, 17, 17]);
        expect(result.subtotalCents).toBe(51);
        expect(result.taxCents).toBe(7);
        expect(result.totalCents).toBe(58);
        expect(invoiceModel(dataset, {...settings, rounding: 15, roundingMode: "up"}).totalSeconds).toBe(2700);
    });
    it("rejects invalid prices, dates, and tax instead of generating incorrect charges", () => {
        for (const hourlyRate of ["-1", "NaN", "Infinity", "1e3", "1.234", "1000001"]) {
            expect(invoiceErrors({...DEFAULT_INVOICE, hourlyRate}).length).toBeGreaterThan(0);
        }
        expect(invoiceErrors({...DEFAULT_INVOICE, issuedOn: "2026-02-30"}).length).toBeGreaterThan(0);
        expect(invoiceErrors({...DEFAULT_INVOICE, taxPercent: "101"}).length).toBeGreaterThan(0);
        expect(invoiceErrors({...DEFAULT_INVOICE, issuedOn: "2026-03-10", dueOn: "2026-03-01"}).length).toBeGreaterThan(0);
    });
    it("preserves invoice details and category selection in saved presets", () => {
        const preset = builtInExportPresets().find(item => item.name === "Invoice")!;
        const settings = {...preset, options: invoiceOptions("125.50")};
        settings.scopeTemplate.filters.manualCategories = [2];
        settings.options.pdf.invoice.number = "INV-123";
        expect(deserializeSettings(serializeSettings(settings), preset)).toEqual({scopeTemplate: settings.scopeTemplate, options: settings.options});
    });
});
