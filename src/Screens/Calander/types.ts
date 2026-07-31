export type CalendarEvent = {
    title: string;
    start: Date;
    end: Date;
    apps: { app: string; totalDuration: number }[];
    category?: string;
    timeBlockId?: number;
    googleCalendarEventId?: string;
    googleCalendarId?: number;
    description?: string;
    location?: string;
} | null;

export type EventLogs = {
    ids: number[];
    device_uuid: string | null;
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
