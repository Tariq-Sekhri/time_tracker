import { View } from "../../App.tsx";
import { useDateStore } from "../../stores/dateStore.ts";

export type CalendarEvent = {
    title: string;
    start: Date;
    end: Date;
    apps: { app: string; totalDuration: number }[];
    googleCalendarEventId?: string;
    googleCalendarId?: number;
    description?: string;
    location?: string;
} | null;

export type EventLogs = {
    ids: number[];
    app: string;
    timestamp: Date;
    duration: number;
}[];


export type DateClickInfo = {
    date: Date;
    dateStr: string;
    allDay: boolean;
    dayEl: HTMLElement;
    jsEvent: MouseEvent;
    view: any;
}