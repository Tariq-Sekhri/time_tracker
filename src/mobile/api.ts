import {invoke} from "@tauri-apps/api/core";

export type Settings = {
    day_start_hour: number; min_app_duration: number; min_log_duration: number;
    max_attach_distance: number; lookahead_window: number; min_timeblock_duration: number;
    notes_enabled: boolean; use_bar_usage_chart: boolean;
};
export type Timer = {session_id: string; title: string; project_name: string | null; start_time: number};
export type MobileState = {
    permissions: {usage: boolean; browser: boolean; media: boolean}; settings: Settings;
    sync: {server: string | null; registered: boolean; active: boolean; uuid: string | null; name: string; nextSyncSeconds: number | null};
    timer: Timer | null; timerStatus: string; projects: {name: string; color: string}[];
    version: string; firstLogMs: number | null;
};
export type MobileLog = {
    id: number; package_name: string; app_label: string | null; app_name: string;
    start_timestamp: number; end_timestamp: number | null; duration: number; category: string | null;
    [field: string]: string | number | boolean | null;
};
export type Usage = {total: number; apps: {packageName: string; label: string; seconds: number}[]; days: {date: string; seconds: number}[]};

type Requests = {
    state: [undefined, MobileState];
    logs: [{startMs: number; endMs: number; limit?: number; offset?: number}, MobileLog[]];
    usage: [{startMs: number; endMs: number; browserOnly?: boolean}, Usage];
    import: [undefined, null];
    permission: [{kind: "usage" | "browser" | "media"}, null];
    "settings.save": [Partial<Settings>, null];
    "skipped.list": [undefined, {id: number; pattern: string}[]];
    "skipped.count": [{pattern: string}, number];
    "skipped.add": [{pattern: string}, number];
    "skipped.delete": [{id: number}, null];
    "skipped.clear": [undefined, null];
    "log.delete": [{id: number}, null];
    "sync.check": [{server: string}, string];
    "sync.change": [undefined, null];
    "sync.register": [{name: string}, string];
    "sync.approval": [undefined, string];
    "sync.now": [undefined, string];
    "sync.reupload": [undefined, string];
    "sync.devices": [undefined, {uuid: string; name: string}[]];
    "timer.save": [{title: string; project: string | null}, null];
    "timer.stop": [{title: string; project: string | null}, null];
};

export function request<K extends keyof Requests>(operation: K, ...args: Requests[K][0] extends undefined ? [] : [Requests[K][0]]): Promise<Requests[K][1]> {
    return invoke("mobile_request", {operation, payload: args[0] ?? {}});
}
