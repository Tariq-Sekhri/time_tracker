import type { GoogleCalendarEvent, GoogleCalendar } from "../api/GoogleCalendar.ts";

const EVENTS_PREFIX = "google_calendar_events:";
const CALENDARS_KEY = "google_calendar_list";

const eventsCache = new Map<string, GoogleCalendarEvent[]>();
let calendarsCache: GoogleCalendar[] | null = null;

function eventsKey(weekStart: number, weekEnd: number, calendarIds: string): string {
    return `${EVENTS_PREFIX}${weekStart}_${weekEnd}_${calendarIds}`;
}

export function setCachedEvents(
    weekStart: number,
    weekEnd: number,
    calendarIds: string,
    events: GoogleCalendarEvent[],
): void {
    eventsCache.set(eventsKey(weekStart, weekEnd, calendarIds), events);
}

export function getCachedEvents(
    weekStart: number,
    weekEnd: number,
    calendarIds: string,
): GoogleCalendarEvent[] | undefined {
    return eventsCache.get(eventsKey(weekStart, weekEnd, calendarIds));
}

export function setCachedCalendars(calendars: GoogleCalendar[]): void {
    calendarsCache = calendars;
}

export function getCachedCalendars(): GoogleCalendar[] | null {
    return calendarsCache;
}
