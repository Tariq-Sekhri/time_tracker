import {useEffect, useRef} from "react";
import type {EventApi} from "@fullcalendar/core";
import {MANUAL_DRAFT_ID, type ManualTimeDraft} from "./manualCalendarEditing";

type Range = {start: Date | null; end: Date | null};
const range = (value: Range | null) => value ? {
    start: value.start?.getTime() ?? null, end: value.end?.getTime() ?? null,
} : null;
const write = (phase: string, details: object) => console.info(`[manual-calendar] ${phase} ${JSON.stringify(details)}`);

// Boundary logs only: never include entry names, notes, or category names.
export function useManualDragDiagnostics(draft: ManualTimeDraft | null) {
    const latestDraft = useRef(draft);
    latestDraft.current = draft;
    const sequence = useRef(0);
    const session = useRef<{
        id: number; eventId: string; kind: string; outcome: string;
        candidate: ReturnType<typeof range>; allowed: boolean | null; before: ReturnType<typeof range>;
    } | null>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    useEffect(() => () => {
        timers.current.forEach(clearTimeout);
        if (session.current) write("unmounted", session.current);
    }, []);
    useEffect(() => {
        if (session.current?.eventId === MANUAL_DRAFT_ID) {
            write("draft-state", {id: session.current.id, range: range(draft)});
        }
    }, [draft?.start.getTime(), draft?.end.getTime()]);

    return {
        start(event: EventApi, kind: "move" | "resize", mouse: MouseEvent) {
            timers.current.forEach(clearTimeout);
            timers.current = [];
            session.current = {id: ++sequence.current, eventId: event.id, kind, outcome: "no-change-callback", candidate: null, allowed: null, before: range(event)};
            write("start", {...session.current, draft: range(latestDraft.current),
                pointer: {x: mouse.clientX, y: mouse.clientY}, zoom: getComputedStyle(document.documentElement).zoom,
                devicePixelRatio: window.devicePixelRatio, viewport: {width: innerWidth, height: innerHeight},
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, offsetMinutes: new Date().getTimezoneOffset(),
                userAgent: navigator.userAgent});
        },
        candidate(value: Range, allowed: boolean) {
            if (session.current) Object.assign(session.current, {candidate: range(value), allowed});
        },
        outcome(event: EventApi, outcome: string, error?: unknown) {
            write("change", {id: session.current?.id, eventId: event.id, outcome, range: range(event), error: error === undefined ? undefined : String(error)});
            if (session.current?.eventId === event.id) session.current.outcome = outcome;
        },
        stop(event: EventApi, mouse: MouseEvent) {
            const current = session.current;
            if (!current) return;
            const target = document.elementFromPoint(mouse.clientX, mouse.clientY);
            write("stop", {id: current.id, pointer: {x: mouse.clientX, y: mouse.clientY},
                insideGrid: !!target?.closest(".fc-timegrid-body"), overPopover: !!target?.closest("[data-manual-popover]"),
                candidate: current.candidate, allowed: current.allowed});
            // FullCalendar fires stop BEFORE drop/resize. Observe the committed state
            // afterwards, and once more to catch a later refresh resetting the draft.
            for (const delay of [50, 1000]) timers.current.push(setTimeout(() => {
                write("settled", {...current, delayMs: delay, eventRange: range(event), draft: range(latestDraft.current)});
                if (delay === 1000 && session.current === current) session.current = null;
            }, delay));
        },
    };
}
