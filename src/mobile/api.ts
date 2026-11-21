import {invoke} from "@tauri-apps/api/core";

export type Settings = {
    day_start_hour: number; min_app_duration: number; min_log_duration: number;
    max_attach_distance: number; lookahead_window: number; min_timeblock_duration: number;
    notes_enabled: boolean; use_bar_usage_chart: boolean;
};
export type MobileDevice = {
    uuid: string;
    name: string;
    is_local: boolean;
    is_tracking: boolean;
    last_sync_id: number;
    in_cal: boolean;
    in_stats: boolean;
    available_on_server: boolean;
    has_local_logs: boolean;
};
export type Timer = {session_id: string; title: string; project_name: string | null; start_time: number};
export type GoogleCalendarEvent = {id: string; title: string; start: string; end: string; allDay: boolean; calendar: string};
export type MobileState = {
    permissions: {usage: boolean; browser: boolean; media: boolean}; settings: Settings;
    googleCalendar?: {allowed: boolean; selected: string[]};
    sync: {server: string | null; registered: boolean; active: boolean; uuid: string | null; name: string; nextSyncSeconds: number | null};
    devices?: MobileDevice[];
    manualEntries: (Timer & {end_time: number; synced: boolean})[];
    timer: Timer | null; timerStatus: string; projects: {name: string; color: string}[];
    version: string; firstLogMs: number | null;
};
export type MobileLog = {
    id: number; package_name: string; app_label: string | null; app_name: string;
    start_timestamp: number; end_timestamp: number | null; duration: number; category: string | null;
    device_uuid?: string | null; device_name?: string | null; is_remote?: boolean;
    [field: string]: string | number | boolean | null | undefined;
};
export type Usage = {total: number; apps: {packageName: string; label: string; seconds: number}[]; days: {date: string; seconds: number}[]};

type Requests = {
    state: [undefined, MobileState];
    logs: [{startMs: number; endMs: number; limit?: number; offset?: number; scope?: "calendar" | "logs" | "all"; deviceUuid?: string}, MobileLog[]];
    usage: [{startMs: number; endMs: number; browserOnly?: boolean; scope?: "stats" | "all"; deviceUuid?: string}, Usage];
    import: [undefined, null];
    permission: [{kind: "usage" | "browser" | "media"}, null];
    "calendar.permission": [undefined, null];
    "calendar.sources": [undefined, {key: string; name: string; account: string}[]];
    "calendar.select": [{key: string; selected: boolean}, null];
    "calendar.events": [{startMs: number; endMs: number; firstDay: string; endDay: string}, GoogleCalendarEvent[]];
    "settings.save": [Partial<Settings>, null];
    "skipped.list": [undefined, {id: number; pattern: string}[]];
    "skipped.count": [{pattern: string}, number];
    "skipped.add": [{pattern: string}, number];
    "skipped.delete": [{id: number}, null];
    "skipped.clear": [undefined, null];
    "log.delete": [{id: number; device_uuid?: string | null; is_remote?: boolean}, null];
    "sync.check": [{server: string}, string];
    "sync.change": [undefined, null];
    "sync.register": [{name: string}, string];
    "sync.approval": [undefined, string];
    "sync.now": [undefined, string];
    "sync.reupload": [undefined, string];
    "sync.devices": [undefined, MobileDevice[]];
    "sync.subscribe": [{uuid: string; name?: string}, {downloaded: number}];
    "sync.unsubscribe": [{uuid: string}, null];
    "device.update": [{uuid: string; in_cal?: boolean; in_stats?: boolean}, null];
    "timer.save": [{title: string; project: string | null}, null];
    "manual.category.create": [{name: string; parent: string | null}, string];
    "timer.stop": [{title: string; project: string | null}, null];
};

export function request<K extends keyof Requests>(operation: K, ...args: Requests[K][0] extends undefined ? [] : [Requests[K][0]]): Promise<Requests[K][1]> {
    return invoke("mobile_request", {operation, payload: args[0] ?? {}});
}
