import type { MouseEvent } from "react";
import { useCalendarAppFilterStore } from "../stores/calendarAppFilterStore.ts";

export function logRowLeftClickCalendarFilter(_e: MouseEvent, appName: string): void {
    const selectedText = window.getSelection()?.toString() ?? "";
    if (selectedText.trim().length > 0) {
        return;
    }
    useCalendarAppFilterStore.getState().selectApp(appName);
}
