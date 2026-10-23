import {describe, expect, it} from "vitest";
import {options, sampleDataset} from "./fixtures.ts";
import {buildExport, defaultExportOptions, JSON_EXPORT_FORMAT, JSON_EXPORT_VERSION} from "./index.ts";

describe("json export", () => {
    it("round-trips the dataset with a format header", async () => {
        const data = sampleDataset();
        const [file] = await buildExport(data, options({format: "json"}));
        expect(file.fileName).toBe("time-tracker-export-2026-03-01_to_2026-03-31.json");
        expect(file.mimeType).toBe("application/json");
        const textValue = new TextDecoder().decode(file.bytes);
        expect(textValue.startsWith('{\n  "format": "time-tracker-export",\n  "version": 1,')).toBe(true);
        const parsed = JSON.parse(textValue);
        expect(parsed.format).toBe(JSON_EXPORT_FORMAT);
        expect(parsed.version).toBe(JSON_EXPORT_VERSION);
        const {format: _format, version: _version, ...rest} = parsed;
        expect(rest).toEqual(data);
    });
});

describe("defaultExportOptions", () => {
    it("matches the documented defaults", () => {
        const defaults = defaultExportOptions();
        expect(defaults).toMatchObject({
            format: "xlsx",
            framework: "native",
            columns: {},
            durationFormat: "hms",
            timeFormat: "24h",
            dateFormat: "iso",
            csvDelimiter: ",",
            csvBom: true,
            rounding: 0,
            roundingMode: "nearest",
            summaryGrouping: "category",
        });
        expect(defaults.pdf.sections.signature).toBe(false);
        expect(defaults.pdf.sections.detail).toBe(true);
    });
});
