/*
 * Dev-only: renders sample PDF time reports from a fake dataset so the layout can be inspected.
 *   node scripts/render-sample-pdf.mts [outDir]
 * (Node 22.18+ strips TypeScript types natively.) Default outDir: $TEMP/time-tracker-pdf-samples.
 * Turn pages into PNGs with e.g. `pdftoppm -r 110 -png <file>.pdf <prefix>`.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildPdfReport} from "../src/dataTransfer/formats/export/pdf.ts";
import {emptyDataset, sampleDataset, samplePdfOptions, withLogs} from "../src/dataTransfer/formats/export/pdf/fixtures.ts";

const outDir = process.argv[2] ?? join(tmpdir(), "time-tracker-pdf-samples");
mkdirSync(outDir, {recursive: true});

const samples = [
    ["portrait-a4", sampleDataset(), samplePdfOptions()],
    [
        "landscape-letter",
        sampleDataset(),
        samplePdfOptions(
            {orientation: "landscape", pageSize: "letter", accentColor: "#0f766e", title: "Q4 timesheet — Northwind × Acme", preparedFor: "Acme Corporation, Finance Department"},
            {summaryGrouping: "category", timeFormat: "12h", dateFormat: "us", durationFormat: "decimal", rounding: 15, roundingMode: "up"},
        ),
    ],
    ["manual-only-week-grouping", sampleDataset({sessions: false, days: 90}), samplePdfOptions({accentColor: "#7c3aed"}, {summaryGrouping: "week"})],
    ["activity-logs", withLogs(sampleDataset({manual: false, days: 14}), 6200), samplePdfOptions({title: "Activity log"}, {summaryGrouping: "device"})],
    ["empty", emptyDataset(), samplePdfOptions()],
] as const;

for (const [name, dataset, options] of samples) {
    const file = await buildPdfReport(dataset, options);
    const path = join(outDir, `${name}.pdf`);
    writeFileSync(path, file.bytes);
    console.log(`${path}  (${file.fileName}, ${(file.bytes.length / 1024).toFixed(0)} KB)`);
}
