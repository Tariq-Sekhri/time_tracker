import type {EventApi} from "@fullcalendar/core";
import {update_manual_time_block} from "../../api/ManualTimeBlock.ts";

export type ManualTimeDraft = {start: Date; end: Date; title: string};
export const MANUAL_DRAFT_ID = "manual-time-draft";
export const MANUAL_HOLD_MS = 300;
export const manualTimeQueryKeys = ["manualTimeBlocks", "week_statistics", "day_statistics", "range_statistics", "total_statistics", "category_app_logs"];

// Always preserve the entry's name, notes and project when changing its geometry.
export async function persistManualEventRange(event: Pick<EventApi, "start" | "end" | "extendedProps">) {
    const id = event.extendedProps.manualTimeBlockId;
    if (typeof id !== "number" || !event.start || !event.end || event.end <= event.start) {
        throw new Error("Choose a valid manual time range.");
    }
    await update_manual_time_block({
        id,
        title: event.extendedProps.manualTitle ?? "",
        notes: event.extendedProps.notes ?? null,
        project_id: event.extendedProps.projectId ?? null,
        start_time: Math.floor(event.start.getTime() / 1000),
        end_time: Math.floor(event.end.getTime() / 1000),
    });
}
