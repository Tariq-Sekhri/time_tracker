import {View} from "../../App.tsx";
import {useDateStore} from "../../stores/dateStore.ts";

export type CalendarEvent = {
    title: string;
    start: Date;
    end: Date;
    apps: { app: string; totalDuration: number }[];
} | null;

export type EventLogs = {
    id: number
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