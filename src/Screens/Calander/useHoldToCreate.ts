import {useEffect, useRef, type RefObject, type MouseEvent as ReactMouseEvent} from "react";
import {MANUAL_HOLD_MS} from "./manualCalendarEditing.ts";

export const MANUAL_DRAG_DISTANCE = 12;

export function isManualRangeDrag(start: Date, end: Date, distance: number): boolean {
    return distance >= MANUAL_DRAG_DISTANCE && end.getTime() - start.getTime() > 15 * 60_000;
}

// FullCalendar uses mouse events for desktop selection. Keep the hold on the same
// event stream; a click must never start selection or change the calendar DOM.
export function useHoldToCreate(
    host: RefObject<HTMLDivElement | null>,
    cancelSelection: () => void,
    previewHour: (x: number, y: number) => void,
    onPlainClick: () => void = () => {},
) {
    const gesture = useRef({pressed: false, held: false, moved: false, distance: 0, x: 0, y: 0});
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbacks = useRef({cancelSelection, previewHour, onPlainClick});
    callbacks.current = {cancelSelection, previewHour, onPlainClick};
    const clearTimer = () => {if (timer.current !== null) clearTimeout(timer.current); timer.current = null;};
    useEffect(() => {
        const move = (event: MouseEvent) => {
            const current = gesture.current;
            if (!current.pressed) return;
            current.distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
            if (current.distance < MANUAL_DRAG_DISTANCE) return;
            current.moved = true;
            clearTimer();
        };
        const up = (event: MouseEvent) => {
            clearTimer();
            const current = gesture.current;
            if (current.pressed && !current.held) {
                const element = host.current;
                const start = element && calendarDateAtPoint(element, current.x, current.y);
                const end = element && calendarDateAtPoint(element, event.clientX, event.clientY);
                const crossedSlot = start && end && start.getTime() !== end.getTime();
                if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < MANUAL_DRAG_DISTANCE || !crossedSlot) callbacks.current.onPlainClick();
            }
            current.pressed = false;
        };
        const cancel = () => {
            clearTimer();
            gesture.current.pressed = false;
            gesture.current.held = false;
            callbacks.current.cancelSelection();
        };
        document.addEventListener("mousemove", move, true);
        document.addEventListener("mouseup", up);
        document.addEventListener("pointercancel", cancel);
        window.addEventListener("blur", cancel);
        return () => {
            clearTimer();
            document.removeEventListener("mousemove", move, true);
            document.removeEventListener("mouseup", up);
            document.removeEventListener("pointercancel", cancel);
            window.removeEventListener("blur", cancel);
        };
    }, [host]);
    return {
        gesture,
        onMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
            clearTimer();
            gesture.current = {pressed: false, held: false, moved: false, distance: 0, x: event.clientX, y: event.clientY};
            const target = event.target as HTMLElement;
            if (event.button !== 0 || !target.closest(".fc-timegrid-body") || target.closest(".fc-event")) return;
            gesture.current.pressed = true;
            timer.current = setTimeout(() => {
                gesture.current.held = true;
                callbacks.current.previewHour(gesture.current.x, gesture.current.y);
            }, MANUAL_HOLD_MS);
        },
    };
}

// Read the same rendered day and time lanes FullCalendar uses, including days
// whose visible time range continues past midnight and zoomed calendar rows.
export function calendarDateAtPoint(host: HTMLElement, x: number, y: number): Date | null {
    const column = [...host.querySelectorAll<HTMLElement>(".fc-timegrid-col[data-date]")].find((element) => {
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    });
    const slot = [...host.querySelectorAll<HTMLElement>(".fc-timegrid-slot-lane[data-time]")].find((element) => {
        const rect = element.getBoundingClientRect();
        return y >= rect.top && y < rect.bottom;
    });
    if (!column?.dataset.date || !slot?.dataset.time) return null;
    const [hours, minutes] = slot.dataset.time.split(":").map(Number);
    const rect = slot.getBoundingClientRect();
    const quarter = Math.min(1, Math.floor((y - rect.top) / rect.height * 2));
    const date = new Date(`${column.dataset.date}T00:00:00`);
    date.setHours(hours, minutes + quarter * 15, 0, 0);
    return date;
}
