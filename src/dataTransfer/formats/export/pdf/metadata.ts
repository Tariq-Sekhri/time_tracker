import type {ExportDataset} from "../../../../api/dataTransfer.ts";
import {afterTable, sectionHeading, tableStyle, type Ctx} from "./layout.ts";
import {pdfText} from "./text.ts";

export function hasMetadata(dataset: ExportDataset): boolean {
    return !!(dataset.devices.length || dataset.manual_categories.length || dataset.activity_categories.length || dataset.app_groups.length || dataset.skipped_apps.length);
}

/** Selected reference datasets are useful on their own, without a single time entry. */
export function drawMetadataDetail(ctx: Ctx, dataset: ExportDataset) {
    const table = (title: string, head: string[], rows: string[][]) => {
        if (!rows.length) return;
        sectionHeading(ctx, title, `${rows.length} ${rows.length === 1 ? "record" : "records"}`, 60);
        ctx.autoTable(ctx.doc, {
            ...tableStyle(ctx), startY: ctx.y,
            head: [head.map(label => label.toUpperCase())],
            body: rows.map(row => row.map(pdfText)),
        });
        afterTable(ctx);
    };
    table("Devices", ["Name", "Type", "Device ID", "Calendar", "Statistics"], dataset.devices.map(device => [
        device.name, device.kind, device.uuid, device.in_cal ? "Included" : "Hidden", device.in_stats ? "Included" : "Hidden",
    ]));
    table("Manual categories", ["Category", "Parent category", "Color"], dataset.manual_categories.map(category => [
        category.name, category.parent_name ?? "-", category.color,
    ]));
    table("Activity categories and rules", ["Category", "Priority", "Color", "Matching rules"], dataset.activity_categories.map(category => [
        category.name, String(category.priority), category.color ?? "-", category.rules.join("\n") || "-",
    ]));
    table("App groups", ["Name", "Matching rule"], dataset.app_groups.map(group => [group.name, group.regex]));
    table("Skipped apps", ["Matching rule"], dataset.skipped_apps.map(rule => [rule]));
}
