import {useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import Notes from "../Screens/Notes";
import {DonutChart} from "../Screens/Calander/DonutChart";
import {useToast} from "../Componants/Toast";
import CategoryPicker from "./CategoryPicker";
import {request, type GoogleCalendarEvent, type MobileDevice, type MobileLog, type MobileState, type Settings, type Usage} from "./api";
import {calendarBlocks, clipLog, colorFor, dateAtHour, dateValue, dayStart, duration, logKey, nextDay, rangeFor} from "./model";

type Page = "Usage" | "Logs" | "Calendar" | "Sync" | "Notes" | "Settings";
const pages: Page[] = ["Usage", "Logs", "Calendar", "Sync", "Notes", "Settings"];

function Card({children, className = ""}: {children: ReactNode; className?: string}) { return <section className={`mobile-card ${className}`}>{children}</section>; }
function Empty({children}: {children: ReactNode}) { return <p className="empty">{children}</p>; }
function Modal({title, children, close}: {title: string; children: ReactNode; close: () => void}) {
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
        document.addEventListener("keydown", key);
        const dialog = document.querySelector<HTMLDialogElement>("dialog");
        dialog?.showModal();
        return () => { document.removeEventListener("keydown", key); before?.focus(); };
    }, []);
    return <dialog onCancel={event => { event.preventDefault(); close(); }} aria-label={title}>
        <div className="row"><h2>{title}</h2><button onClick={close} aria-label="Close dialog">Close</button></div>{children}
    </dialog>;
}

function NavIcon({page}: {page: Page}) {
    const paths: Record<Page, string> = {
        Usage: "M12 3a9 9 0 1 0 9 9h-9V3Zm3 0v6h6a9 9 0 0 0-6-6Z",
        Logs: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
        Calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
        Sync: "M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5",
        Notes: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
        Settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
    };
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[page]} /></svg>;
}

export default function MobileApp() {
    const client = useQueryClient();
    const {showToast} = useToast();
    const [page, setPage] = useState<Page>("Usage");
    const [busy, setBusy] = useState(false);
    const swipe = useRef<{x: number; y: number; time: number; horizontal: boolean} | null>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const [drag, setDrag] = useState<{offset: number; target: Page | null; settling: boolean}>({offset: 0, target: null, settling: false});
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
    useEffect(() => {
        history.replaceState({page: "Usage"}, "", "#usage");
        const changed = (event: PopStateEvent) => setPage(pages.includes(event.state?.page) ? event.state.page : "Usage");
        window.addEventListener("popstate", changed);
        return () => window.removeEventListener("popstate", changed);
    }, []);
    useEffect(() => {
        const mobileWindow = window as Window & {__TIME_TRACKER_BACK__?: () => boolean};
        mobileWindow.__TIME_TRACKER_BACK__ = () => {
            const popover = document.querySelector("[data-manual-popover]");
            if (popover) { popover.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})); return true; }
            const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
            if (dialog) { dialog.dispatchEvent(new Event("cancel", {cancelable: true})); return true; }
            if (page !== "Usage") { history.back(); return true; }
            return false;
        };
        return () => { delete mobileWindow.__TIME_TRACKER_BACK__; };
    }, [page]);
    const navigate = (next: Page) => {
        if (next === page || drag.settling) return;
        history.pushState({page: next}, "", `#${next.toLowerCase()}`);
        setPage(next);
    };
    const state = useQuery({queryKey: ["mobile-state"], queryFn: () => request("state"), refetchInterval: 2000});
    useEffect(() => {
        let running = false;
        const refresh = async () => {
            if (document.hidden || running) return;
            running = true;
            try { await request("import"); await client.invalidateQueries({queryKey: ["mobile-data"]}); }
            catch (error) { showToast("Could not refresh usage", "error", 5000, String(error)); }
            finally { running = false; }
        };
        void refresh();
        const timer = window.setInterval(() => void refresh(), 60000);
        document.addEventListener("visibilitychange", refresh);
        return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
    }, [client]);
    const act = async (work: () => Promise<unknown>, message?: string) => {
        setBusy(true);
        try {
            await work();
            await Promise.all([client.invalidateQueries({queryKey: ["mobile-state"]}), client.invalidateQueries({queryKey: ["mobile-data"]}), client.invalidateQueries({queryKey: ["notes"]})]);
            if (message) showToast(message, "success");
            return true;
        } catch (error) { showToast("Could not complete action", "error", 5000, String(error)); return false; }
        finally { setBusy(false); }
    };
    useEffect(() => { if (state.data?.settings.notes_enabled === false && page === "Notes") setPage("Usage"); }, [state.data?.settings.notes_enabled, page]);
    if (!state.data) return <main className="startup"><h1>Time Tracker</h1>{state.error ? <><p role="alert">Could not connect to Android tracking: {String(state.error)}</p><button onClick={() => void state.refetch()}>Try again</button></> : <p role="status">Opening your activity…</p>}</main>;
    const shared = {state: state.data, act, busy};
    const visiblePages = pages.filter(item => item !== "Logs" && item !== "Sync" && (item !== "Notes" || state.data.settings.notes_enabled));
    const renderedPages = page === "Logs" || page === "Sync" ? [page] : visiblePages;
    const settle = (commit: boolean) => {
        const next = commit ? drag.target : null;
        const width = viewport.current?.clientWidth || 1;
        setDrag(current => ({...current, offset: next ? (visiblePages.indexOf(next) > visiblePages.indexOf(page) ? -width : width) : 0, settling: true}));
        settleTimer.current = setTimeout(() => {
            if (next) { history.pushState({page: next}, "", `#${next.toLowerCase()}`); setPage(next); }
            setDrag({offset: 0, target: null, settling: false});
            settleTimer.current = null;
        }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240);
    };
    return <div className="mobile-shell">
        <header className="app-header"><div><small>TIME TRACKER</small><h1>{page === "Usage" ? "Home" : page}</h1></div><span className={`status ${state.data.permissions.usage && state.data.sync.role !== "consumer" ? "active" : ""}`}>{state.data.sync.role === "consumer" ? "Consumer" : state.data.permissions.usage ? "Tracking" : "Setup needed"}</span></header>
        {state.error && <div className="error" role="alert">Could not refresh app status. <button onClick={() => void state.refetch()}>Retry</button></div>}
        <div ref={viewport} className="page-viewport"
            onTouchStart={event => {
                swipe.current = null;
                const target = event.target as HTMLElement;
                if (page === "Logs" || page === "Sync" || drag.settling || event.touches.length !== 1 || target.closest('dialog, input, textarea, select, [role="slider"], .device-filter')) return;
                const touch = event.touches[0];
                swipe.current = {x: touch.clientX, y: touch.clientY, time: Date.now(), horizontal: false};
            }}
            onTouchMove={event => {
                const start = swipe.current;
                if (!start) return;
                if (event.touches.length !== 1) { swipe.current = null; settle(false); return; }
                const touch = event.touches[0];
                const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
                if (!start.horizontal) {
                    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; return; }
                    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
                    start.horizontal = true;
                }
                const target = visiblePages[visiblePages.indexOf(page) + (dx < 0 ? 1 : -1)] ?? null;
                const width = viewport.current?.clientWidth || 1;
                setDrag({offset: target ? Math.max(-width, Math.min(width, dx)) : dx * 0.15, target, settling: false});
            }}
            onTouchCancel={() => { if (swipe.current?.horizontal) settle(false); swipe.current = null; }}
            onTouchEnd={() => {
                const start = swipe.current;
                swipe.current = null;
                if (!start?.horizontal) return;
                const distance = Math.abs(drag.offset), width = viewport.current?.clientWidth || 1;
                settle(!!drag.target && (distance > width * 0.28 || (Date.now() - start.time < 300 && distance > 45)));
            }}
            onClickCapture={event => { if (drag.offset || drag.settling) { event.preventDefault(); event.stopPropagation(); } }}>
            {renderedPages.filter(item => item === page || item === drag.target).map(item => {
                const side = item === page ? 0 : visiblePages.indexOf(item) > visiblePages.indexOf(page) ? 100 : -100;
                return <main key={item} className={`swipe-page ${item === "Notes" ? "notes-page" : "page-content"}`}
                    aria-hidden={item !== page} inert={item !== page}
                    style={{transform: `translateX(calc(${side}% + ${drag.offset}px))`, transition: drag.settling ? "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)" : "none"}}>
            {state.data.sync.role !== "consumer" && !state.data.permissions.usage && item !== "Settings" && <Card><h2>Enable app usage tracking</h2><p>Allow Usage Access to record app activity. Browser and media tracking are optional.</p><button className="primary" disabled={busy} onClick={() => void act(() => request("permission", {kind: "usage"}))}>Open Usage Access</button></Card>}
            {item === "Usage" && <UsageScreen {...shared} />}
            {item === "Logs" && <><button onClick={() => history.back()}>Back to calendar</button><LogsScreen {...shared} /></>}
            {item === "Calendar" && <CalendarScreen {...shared} openLogs={() => navigate("Logs")} />}
            {item === "Sync" && <><button onClick={() => history.back()}>Back to settings</button><SyncScreen {...shared} /></>}
            {item === "Notes" && <Notes showHeading={false} showToolbar={false} />}
            {item === "Settings" && <SettingsScreen {...shared} openSync={() => navigate("Sync")} />}
                </main>;
            })}
        </div>
        <nav className="bottom-nav" aria-label="Main navigation">{visiblePages.map(item => <button key={item} aria-current={page === item || (page === "Logs" && item === "Calendar") || (page === "Sync" && item === "Settings") ? "page" : undefined} onClick={() => navigate(item)}><NavIcon page={item} /><span>{item === "Usage" ? "Home" : item}</span></button>)}</nav>
    </div>;
}

type ScreenProps = {state: MobileState; busy: boolean; act: (work: () => Promise<unknown>, message?: string) => Promise<boolean>};
type ManualBlock = MobileState["manualEntries"][number] & {running: boolean};

function TimerCard({state, act, busy}: ScreenProps) {
    const [title, setTitle] = useState(state.timer?.title ?? "");
    const [project, setProject] = useState(state.timer?.project_name ?? "");
    const [editing, setEditing] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { if (!editing) { setTitle(state.timer?.title ?? ""); setProject(state.timer?.project_name ?? ""); } }, [state.timer?.session_id, state.timer?.title, state.timer?.project_name]);
    useEffect(() => {
        if (!state.timer) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [state.timer?.session_id, state.timer?.start_time]);
    const createCategory = async (name: string, parent: string | null) => {
        let saved: string | null = null;
        await act(async () => { saved = await request("manual.category.create", {name, parent}); }, "Category created");
        return saved;
    };
    return <Card className={`timer-card${state.timer ? " running" : ""}`}>
        <div className="timer-row">
            <input aria-label="What are you working on?" placeholder="What are you working on?" value={title} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={event => setTitle(event.target.value)} />
            {state.timer && <span className="timer-elapsed" aria-label="Elapsed time"><i className="dot" />{duration(Math.max(0, now / 1000 - state.timer.start_time))}</span>}
        </div>
        <div className="timer-row timer-controls">
            <CategoryPicker categories={state.projects} value={project} onChange={setProject} onCreate={createCategory} />
            <button type="button" className={state.timer ? undefined : "primary"} disabled={busy} onClick={() => void act(() => request("timer.save", {title, project: project || null}), state.timer ? "Timer updated" : "Timer started")}>{state.timer ? "Save" : "Start"}</button>
            {state.timer && <button type="button" className="primary" disabled={busy} onClick={() => void act(() => request("timer.stop", {title, project: project || null}), "Time recorded")}>Stop</button>}
        </div>
        {(state.manualEntries?.length ?? 0) > 0 && <details className="manual-history"><summary>Recent sessions ({state.manualEntries.length})</summary>{state.manualEntries.slice(-5).reverse().map(entry => <div className="usage-row" key={entry.session_id}>
            <div className="row"><strong>{entry.title || "Untitled session"}</strong><span>{duration(entry.end_time - entry.start_time)}</span></div>
            <small>{new Date(entry.start_time * 1000).toLocaleString()}{entry.project_name ? ` / ${entry.project_name}` : ""} / {entry.synced ? "Synced" : "Saved on phone / Waiting to sync"}</small>
        </div>)}</details>}
    </Card>;
}

function DateRange({start, end, setStart, setEnd}: {start: string; end: string; setStart: (date: string) => void; setEnd: (date: string) => void}) {
    return <div className="date-range"><label>From<input type="date" value={start} max={end} onChange={event => { if (event.target.value) setStart(event.target.value); }} /></label><label>Through<input type="date" value={end} min={start} max={dateValue(new Date())} onChange={event => { if (event.target.value) setEnd(event.target.value); }} /></label></div>;
}

function visibleActivityDevices(state: MobileState): MobileDevice[] {
    return (state.devices ?? []).filter(device => device.is_local || device.is_tracking || device.has_local_logs);
}

function DeviceFilterBar({devices, selected, onSelect}: {devices: MobileDevice[]; selected: string | null; onSelect: (uuid: string | null) => void}) {
    if (devices.length <= 1) return null;
    return <div className="device-filter" role="group" aria-label="Filter by device">
        <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)}>All devices</button>
        {devices.map(device => <button key={device.uuid} type="button" aria-pressed={selected === device.uuid} onClick={() => onSelect(device.uuid)}>
            {device.is_local ? `${device.name} (this phone)` : device.name}
        </button>)}
    </div>;
}

function UsageScreen(props: ScreenProps) {
    const {state} = props;
    const devices = visibleActivityDevices(state);
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    useEffect(() => {
        if (selectedDevice && !devices.some(device => device.uuid === selectedDevice)) setSelectedDevice(null);
    }, [devices, selectedDevice]);
    const today = dateValue(dayStart(new Date(), state.settings.day_start_hour));
    const [period, setPeriod] = useState("Today");
    const [start, setStart] = useState(state.firstLogMs ? dateValue(dayStart(new Date(state.firstLogMs), state.settings.day_start_hour)) : today);
    const [end, setEnd] = useState(today);
    const [browserOnly, setBrowserOnly] = useState(false);
    const [average, setAverage] = useState(false);
    const [chart, setChart] = useState(state.settings.use_bar_usage_chart ? "Bars" : "Donut");
    const [showAll, setShowAll] = useState(false);
    const range = rangeFor(period, new Date(), state.settings.day_start_hour, start, end);
    const usage = useQuery({queryKey: ["mobile-data", "usage", range, browserOnly, selectedDevice], queryFn: () => request("usage", {...range, browserOnly, scope: "stats", deviceUuid: selectedDevice ?? undefined}), refetchInterval: 15000});
    const days = Math.max(1, Math.round((Date.UTC(...dateParts(dateValue(new Date(range.endMs - 1)))) - Date.UTC(...dateParts(dateValue(new Date(range.startMs))))) / 86400000) + 1);
    const divisor = average ? days : 1;
    const slices = usage.data?.apps.filter(app => app.seconds >= state.settings.min_app_duration).map(app => ({...app, seconds: app.seconds / divisor})) ?? [];
    const total = (usage.data?.total ?? 0) / divisor;
    const selectedDeviceName = devices.find(device => device.uuid === selectedDevice)?.name;
    return <>
        <TimerCard {...props} />
        <DeviceFilterBar devices={devices} selected={selectedDevice} onSelect={setSelectedDevice} />
        <div className="segments" aria-label="Usage period">{["Today", "Week", "Month", "Custom"].map(item => <button key={item} aria-pressed={period === item} onClick={() => { setPeriod(item); setShowAll(false); }}>{item}</button>)}</div>
        {period === "Custom" && <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />}
        <div className="segments"><button aria-pressed={!average} onClick={() => setAverage(false)}>Total</button><button aria-pressed={average} onClick={() => setAverage(true)}>Daily average</button></div>
        <Card><small>{average ? "AVERAGE PER DAY" : "TRACKED TIME"}</small><div className="big-number">{duration(total)}</div><p>{selectedDeviceName ? `Activity on ${selectedDeviceName}` : devices.length > 1 ? "Activity across selected devices" : "Activity recorded on this phone"}</p></Card>
        {usage.error && <p className="error" role="alert">Could not load activity. <button onClick={() => void usage.refetch()}>Retry</button></p>}
        <Card><div className="row"><h2>App usage</h2><button aria-pressed={browserOnly} onClick={() => setBrowserOnly(value => !value)}>Browser</button></div>
            <div className="segments compact">{["Donut", "Bars", "Trend"].map(item => <button key={item} aria-pressed={chart === item} onClick={() => setChart(item)}>{item}</button>)}</div>
            {usage.isPending ? <Empty>Loading usage…</Empty> : total === 0 ? <Empty>No activity in this range.</Empty> : chart === "Donut" ? <div className="donut"><DonutChart data={slices.slice(0, 8).map(app => ({label: app.label, value: app.seconds, color: colorFor(app.packageName)}))} colors={new Map()} totalDuration={total} periodLabel="the selected range" /></div> : <UsageChart usage={usage.data!} trend={chart === "Trend"} />}
            {(showAll ? slices : slices.slice(0, 5)).map(app => <div className="usage-row" key={`${app.packageName}:${app.label}`}><div className="row"><span className="app-label">{app.label}</span><span>{duration(app.seconds)} <small>{total > 0 ? (app.seconds / total * 100).toFixed(1) : 0}%</small></span></div><div className="meter"><i style={{width: `${total ? app.seconds / total * 100 : 0}%`, background: colorFor(app.packageName)}} /></div></div>)}
            {!showAll && slices.length > 5 && <button className="wide" onClick={() => setShowAll(true)}>Show all {slices.length} apps</button>}
        </Card>
    </>;
}
function dateParts(value: string): [number, number, number] { const [y, m, d] = value.split("-").map(Number); return [y, m - 1, d]; }
function UsageChart({usage, trend}: {usage: Usage; trend: boolean}) {
    const data = trend ? usage.days.map(day => ({label: day.date.slice(5), minutes: Math.round(day.seconds / 60)})) : usage.apps.slice(0, 8).map(app => ({label: app.label, minutes: Math.round(app.seconds / 60)}));
    return <div className="bar-chart"><ResponsiveContainer width="100%" height={240}><BarChart data={data}><XAxis dataKey="label" tick={{fill: "#a9b0bf", fontSize: 10}} /><YAxis width={34} tick={{fill: "#a9b0bf", fontSize: 10}} /><Tooltip contentStyle={{background: "#1c202a", border: "1px solid #444"}} /><Bar dataKey="minutes" fill="#b18bff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function DayPicker({day, setDay, hour, week = false, allowFuture = false}: {day: string; setDay: (value: string) => void; hour: number; week?: boolean; allowFuture?: boolean}) {
    const today = dateValue(dayStart(new Date(), hour));
    const step = week ? 7 : 1;
    const period = week ? "week" : "day";
    const shift = (amount: number) => {
        const date = dateAtHour(day, 0);
        date.setDate(date.getDate() + amount);
        const value = dateValue(date);
        setDay(!allowFuture && value > today ? today : value);
    };
    const atCurrentPeriod = week ? weekStart(day) >= weekStart(today) : day >= today;
    return <div className="day-picker"><button onClick={() => shift(-step)} aria-label={`Previous ${period}`}>‹</button><input type="date" aria-label="Selected day" value={day} max={allowFuture ? undefined : today} onChange={event => { if (event.target.value && (allowFuture || event.target.value <= today)) setDay(event.target.value); }} /><button disabled={!allowFuture && atCurrentPeriod} onClick={() => shift(step)} aria-label={`Next ${period}`}>›</button><button disabled={day === today} onClick={() => setDay(today)}>Today</button></div>;
}

function LogDetails({log, close, act, busy}: {log: MobileLog; close: () => void} & Pick<ScreenProps, "act" | "busy">) {
    const [confirm, setConfirm] = useState(false);
    return <Modal title={log.app_label || log.app_name} close={close}><dl className="log-details">{Object.entries(log).filter(([key, value]) => value != null && key !== "is_remote").map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{typeof value === "number" && /timestamp|time_used|install_time|update_time/.test(key) ? new Date(value).toLocaleString() : String(value)}</dd></div>)}</dl>
        {confirm ? <div className="confirmation"><p>{log.is_remote ? "Remove this downloaded log from this phone? It stays on its source device and the sync server." : "Delete this log? Its deletion will also be uploaded on the next sync."}</p><button className="danger" disabled={busy} onClick={() => void act(() => request("log.delete", log.is_remote ? {id: log.id, device_uuid: log.device_uuid, is_remote: true} : {id: log.id}), log.is_remote ? "Log removed" : "Log deleted").then(ok => { if (ok) close(); })}>{log.is_remote ? "Remove log" : "Delete log"}</button><button onClick={() => setConfirm(false)}>Keep log</button></div> : <button className="danger" onClick={() => setConfirm(true)}>{log.is_remote ? "Remove log…" : "Delete log…"}</button>}
    </Modal>;
}

function LogsScreen(props: ScreenProps) {
    const hour = props.state.settings.day_start_hour;
    const devices = visibleActivityDevices(props.state);
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    useEffect(() => {
        if (selectedDevice && !devices.some(device => device.uuid === selectedDevice)) setSelectedDevice(null);
    }, [devices, selectedDevice]);
    const [day, setDay] = useState(dateValue(dayStart(new Date(), hour)));
    const [limit, setLimit] = useState(100);
    const [selected, setSelected] = useState<MobileLog | null>(null);
    const start = dateAtHour(day, hour), end = nextDay(start);
    const logs = useQuery({queryKey: ["mobile-data", "logs", day, hour, limit, selectedDevice], queryFn: async () => {
        const rows: MobileLog[] = [];
        while (rows.length <= limit) {
            const batch = await request("logs", {startMs: +start, endMs: +end, offset: rows.length, limit: Math.min(500, limit + 1 - rows.length), scope: "logs", deviceUuid: selectedDevice ?? undefined});
            rows.push(...batch);
            if (batch.length === 0 || rows.length > limit) break;
        }
        return rows;
    }, refetchInterval: 5000});
    return <><DayPicker day={day} setDay={value => { setDay(value); setLimit(100); }} hour={hour} />
        <DeviceFilterBar devices={devices} selected={selectedDevice} onSelect={value => { setSelectedDevice(value); setLimit(100); }} />
        <div className="row"><p className="muted">{devices.length > 1 ? "Local and downloaded device activity" : "Local app, browser, and media activity"}</p><button disabled={props.busy} onClick={() => void props.act(() => request("import"))}>Refresh</button></div>
        {logs.error && <p role="alert">Could not load logs. <button onClick={() => void logs.refetch()}>Retry</button></p>}
        {logs.isPending ? <Empty>Loading activity…</Empty> : !logs.data?.length ? <Empty>No activity recorded for this day.</Empty> : <div className="log-list">{logs.data.slice(0, limit).map(log => <button key={logKey(log)} className="log-row" onClick={() => setSelected(log)}><span className="dot" style={{background: colorFor(log.package_name)}} /><span className="app-label"><strong>{log.app_label || log.app_name}</strong><small>{[log.is_remote ? null : log.app_name, devices.length > 1 ? log.device_name : null, new Date(log.start_timestamp).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})].filter(Boolean).join(" · ")}</small></span><span>{duration(clipLog(log, +start, +end).duration)}</span></button>)}</div>}
        {(logs.data?.length ?? 0) > limit && <button onClick={() => setLimit(limit + 100)}>Show more logs</button>}
        {selected && <LogDetails log={selected} close={() => setSelected(null)} {...props} />}
    </>;
}

const CALENDAR_ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 2.5, 3] as const;
const DEFAULT_ZOOM_INDEX = 2;
const BASE_SLOT_HEIGHT = 28;
const CALENDAR_POSITION_KEY = "time-tracker.mobile.calendar-position";

function weekStart(day: string) {
    const date = dateAtHour(day, 0);
    date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    return dateValue(date);
}

function readCalendarPosition(hour: number): {day: string; view: "day" | "week"} {
    const today = dateValue(dayStart(new Date(), hour));
    try {
        const saved = JSON.parse(localStorage.getItem(CALENDAR_POSITION_KEY) ?? "null");
        const day = saved?.day;
        if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && dateValue(dateAtHour(day, 0)) === day) {
            return {day, view: saved.view === "week" ? "week" : "day"};
        }
    } catch { /* A fresh view is available if storage is unavailable. */ }
    return {day: today, view: "day"};
}

function touchDistance(a: {clientX: number; clientY: number}, b: {clientX: number; clientY: number}) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function CalendarScreen(props: ScreenProps & {openLogs: () => void}) {
    const hour = props.state.settings.day_start_hour;
    const devices = visibleActivityDevices(props.state);
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    useEffect(() => {
        if (selectedDevice && !devices.some(device => device.uuid === selectedDevice)) setSelectedDevice(null);
    }, [devices, selectedDevice]);
    const [position, setPosition] = useState(() => readCalendarPosition(hour));
    const {day, view} = position;
    const week = view === "week";
    const setDay = (value: string) => setPosition(current => ({...current, day: value}));
    useEffect(() => {
        try { localStorage.setItem(CALENDAR_POSITION_KEY, JSON.stringify(position)); } catch { /* Storage may be unavailable. */ }
    }, [position]);
    const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
    const zoom = CALENDAR_ZOOM_STEPS[zoomIndex];
    const slotHeight = Math.round(BASE_SLOT_HEIGHT * zoom);
    const calendarWrapRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<FullCalendar>(null);
    const pendingScrollRef = useRef<{anchorInCal: number; oldHeight: number; newHeight: number} | null>(null);
    const pinchRef = useRef<{distance: number} | null>(null);
    const setZoomStep = (nextIndex: number) => {
        const clamped = Math.max(0, Math.min(CALENDAR_ZOOM_STEPS.length - 1, nextIndex));
        if (clamped === zoomIndex) return;
        const calEl = calendarWrapRef.current;
        const scroller = calEl?.closest<HTMLElement>(".page-content");
        if (calEl && scroller && scroller.scrollTop > 0) {
            const anchorInCal = scroller.scrollTop + scroller.clientHeight * 0.4 - calEl.offsetTop;
            if (anchorInCal > 0) {
                pendingScrollRef.current = {
                    anchorInCal,
                    oldHeight: slotHeight,
                    newHeight: Math.round(BASE_SLOT_HEIGHT * CALENDAR_ZOOM_STEPS[clamped]),
                };
            }
        }
        setZoomIndex(clamped);
    };
    useLayoutEffect(() => {
        calendarRef.current?.getApi().updateSize();
        const pending = pendingScrollRef.current;
        if (pending && calendarWrapRef.current) {
            const calEl = calendarWrapRef.current;
            const scroller = calEl.closest<HTMLElement>(".page-content");
            if (scroller) {
                scroller.scrollTop = Math.max(0, calEl.offsetTop + pending.anchorInCal * (pending.newHeight / pending.oldHeight) - scroller.clientHeight * 0.4);
            }
            pendingScrollRef.current = null;
        }
        const raf = requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
        return () => cancelAnimationFrame(raf);
    }, [slotHeight]);
    const [selected, setSelected] = useState<MobileLog[] | null>(null);
    const [detail, setDetail] = useState<MobileLog | null>(null);
    const firstDay = week ? weekStart(day) : day;
    const dayCount = week ? 7 : 1;
    const {dayBounds, start, end, endDay} = useMemo(() => {
        const date = dateAtHour(firstDay, 0);
        const dayBounds = Array.from({length: dayCount + 1}, (_, offset) => new Date(
            date.getFullYear(), date.getMonth(), date.getDate() + offset, hour
        ).getTime());
        return {dayBounds, start: dayBounds[0], end: dayBounds[dayCount], endDay: dateValue(new Date(dayBounds[dayCount]))};
    }, [firstDay, dayCount, hour]);
    const logs = useQuery({queryKey: ["mobile-data", "calendar", firstDay, dayCount, hour, selectedDevice], queryFn: async ({signal}) => {
        const rows = new Map<string, MobileLog>(); let offset = 0;
        for (;;) {
            signal.throwIfAborted();
            const batch = await request("logs", {startMs: +start, endMs: +end, offset, limit: 500, scope: "calendar", deviceUuid: selectedDevice ?? undefined});
            batch.forEach(log => rows.set(logKey(log), log));
            if (batch.length < 500) return [...rows.values()];
            offset += batch.length;
        }
    }, refetchInterval: 15000});
    const settings = props.state.settings;
    const blocks = useMemo(() => dayBounds.slice(0, -1).flatMap((from, index) => {
        const to = dayBounds[index + 1];
        const relevant = (logs.data ?? []).filter(log =>
            log.start_timestamp < to && (log.end_timestamp ?? log.start_timestamp + log.duration * 1000) > from
        );
        return calendarBlocks(relevant, from, to, settings).map(block => ({...block, id: `${from}:${block.id}`}));
    }), [dayBounds, logs.data, settings]);
    const google = props.state.googleCalendar;
    const showGoogle = !!google?.allowed && google.selected.length > 0;
    const googleEvents = useQuery({
        queryKey: ["mobile-data", "google-events", firstDay, endDay, hour, google?.selected],
        queryFn: () => request("calendar.events", {startMs: start, endMs: end, firstDay, endDay}),
        enabled: showGoogle,
        refetchInterval: 60000,
        gcTime: 0,
    });
    const [googleEvent, setGoogleEvent] = useState<GoogleCalendarEvent | null>(null);
    const [manual, setManual] = useState<ManualBlock | null>(null);
    const {timer, manualEntries = [], projects} = props.state;
    const manualBlocks: ManualBlock[] = [...manualEntries.map(entry => ({...entry, running: false})), ...(timer ? [{...timer, end_time: Date.now() / 1000, synced: false, running: true}] : [])]
        .filter(entry => entry.end_time * 1000 > +start && entry.start_time * 1000 < +end);
    const manualColor = (project: string | null) => project ? projects.find(item => item.name === project)?.color ?? "#a78bfa" : "#64748b";
    const events = [
        ...blocks.map(block => ({id: block.id, title: `${block.title}${devices.length > 1 && !selectedDevice && block.deviceName ? ` · ${block.deviceName}` : ""} · ${duration(block.activeSeconds)}`, start: new Date(block.start), end: new Date(block.end), backgroundColor: colorFor(block.packageName), borderColor: "transparent", textColor: "#111318", extendedProps: {logs: block.logs}})),
        ...manualBlocks.map(entry => ({id: `manual-${entry.session_id}`, title: `${entry.running ? "● " : ""}${entry.title || "Untitled session"}${entry.project_name ? ` · ${entry.project_name}` : ""} · ${duration(entry.end_time - entry.start_time)}`, start: new Date(Math.max(+start, entry.start_time * 1000)), end: new Date(Math.min(+end, entry.end_time * 1000)), backgroundColor: manualColor(entry.project_name), borderColor: "#f2f3f7", textColor: "#111318", classNames: ["manual-event"], extendedProps: {manual: entry}})),
        ...(showGoogle ? googleEvents.data ?? [] : []).map(event => ({
            ...event, backgroundColor: "#83c5ed", borderColor: "transparent", textColor: "#111318", extendedProps: {googleEvent: event},
        })),
    ];
    return <><DayPicker day={day} setDay={setDay} hour={hour} week={week} allowFuture={showGoogle} />
        <DeviceFilterBar devices={devices} selected={selectedDevice} onSelect={setSelectedDevice} />
        <div className="row calendar-toolbar">
            <div className="calendar-views" role="group" aria-label="Calendar view">
                {(["day", "week"] as const).map(option => <button key={option} type="button" aria-pressed={view === option} onClick={() => setPosition(current => ({...current, view: option}))}>{option === "day" ? "Day" : "Week"}</button>)}
            </div>
            <div className="zoom-controls" role="group" aria-label="Calendar zoom">
                <button type="button" aria-label="Zoom out" disabled={zoomIndex <= 0} onClick={() => setZoomStep(zoomIndex - 1)}>−</button>
                <button type="button" className="zoom-level" aria-label="Reset zoom" disabled={zoomIndex === DEFAULT_ZOOM_INDEX} onClick={() => setZoomStep(DEFAULT_ZOOM_INDEX)}>{Math.round(zoom * 100)}%</button>
                <button type="button" aria-label="Zoom in" disabled={zoomIndex >= CALENDAR_ZOOM_STEPS.length - 1} onClick={() => setZoomStep(zoomIndex + 1)}>+</button>
            </div>
            <button onClick={props.openLogs}>View logs</button>
        </div>
        {logs.error && <p role="alert">Could not load calendar. <button onClick={() => void logs.refetch()}>Retry</button></p>}
        {showGoogle && googleEvents.isPending && <p className="muted" role="status">Loading Google events…</p>}
        {showGoogle && googleEvents.error && <p role="alert">Could not load Google events. <button onClick={() => void googleEvents.refetch()}>Retry</button></p>}
        {logs.isPending && <p className="muted" role="status">Loading time blocks…</p>}
        <div ref={calendarWrapRef} className="mobile-calendar" style={{"--slot-height": `${slotHeight}px`} as CSSProperties}
            onTouchStart={event => {
                if (event.touches.length === 2) pinchRef.current = {distance: touchDistance(event.touches[0], event.touches[1])};
            }}
            onTouchMove={event => {
                if (event.touches.length !== 2 || !pinchRef.current) return;
                const dist = touchDistance(event.touches[0], event.touches[1]);
                const ratio = dist / pinchRef.current.distance;
                if (ratio >= 1.22) {
                    setZoomStep(zoomIndex + 1);
                    pinchRef.current.distance = dist;
                } else if (ratio <= 0.82) {
                    setZoomStep(zoomIndex - 1);
                    pinchRef.current.distance = dist;
                }
            }}
            onTouchEnd={event => {
                if (event.touches.length < 2) pinchRef.current = null;
            }}
            onTouchCancel={() => { pinchRef.current = null; }}>
            <FullCalendar ref={calendarRef} key={`${firstDay}:${view}:${hour}`} plugins={[timeGridPlugin, interactionPlugin]}
                initialView={week ? "timeGridWeek" : "timeGridDay"} initialDate={firstDay} firstDay={1} headerToolbar={false}
                allDaySlot={showGoogle && !!googleEvents.data?.some(event => event.allDay)} dayHeaders={week}
                dayHeaderContent={({date}) => <button type="button" className="calendar-day-heading"
                    aria-label={date.toLocaleDateString([], {dateStyle: "full"})}
                    onClick={() => setPosition({day: dateValue(date), view: "day"})}>
                    <span>{date.toLocaleDateString([], {weekday: "short"})}</span><strong>{date.getDate()}</strong>
                </button>}
                height="auto" slotMinTime={`${String(hour).padStart(2, "0")}:00:00`} slotMaxTime={`${hour + 24}:00:00`}
                scrollTime={`${hour}:00:00`} nowIndicator events={events}
                eventClick={({event, jsEvent}) => {
                    jsEvent.preventDefault();
                    const {manual, logs, googleEvent} = event.extendedProps;
                    if (googleEvent) setGoogleEvent(googleEvent);
                    else if (manual) setManual(manual);
                    else if (logs) setSelected(logs);
                }} />
        </div>
        {!logs.isPending && !logs.error && !events.length && (!showGoogle || googleEvents.isSuccess) && <p className="muted">No events or time blocks for this {view}.</p>}
        {showGoogle && googleEvent && <Modal title={googleEvent.title} close={() => setGoogleEvent(null)}>
            <p>{googleEvent.calendar} · Google Calendar</p>
            {googleEvent.allDay ? <p>All day</p> : <p>{new Date(googleEvent.start).toLocaleString()} – {new Date(googleEvent.end).toLocaleString()}</p>}
        </Modal>}
        {manual && <Modal title={manual.running ? "Running timer" : "Manual time"} close={() => setManual(null)}><dl className="log-details">
            {([["Title", manual.title || "Untitled session"], ["Category", manual.project_name || "Uncategorized"], ["Start", new Date(manual.start_time * 1000).toLocaleString()], ["End", manual.running ? "Running" : new Date(manual.end_time * 1000).toLocaleString()], ["Duration", duration(manual.end_time - manual.start_time)], ["Status", manual.running ? "Recording" : manual.synced ? "Synced" : "Saved on phone / Waiting to sync"]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl></Modal>}
        {selected && !detail && <Modal title="Time block activity" close={() => setSelected(null)}>{selected.map(log => <button className="log-row" key={logKey(log)} onClick={() => setDetail(log)}><span className="app-label">{log.app_label || log.app_name}<small>{[devices.length > 1 ? log.device_name : null, new Date(log.start_timestamp).toLocaleTimeString()].filter(Boolean).join(" · ")}</small></span><span>{duration(log.duration)}</span></button>)}</Modal>}
        {detail && <LogDetails log={detail} close={() => { setDetail(null); setSelected(null); }} {...props} />}
    </>;
}

function SyncScreen({state, act, busy}: ScreenProps) {
    const {showToast} = useToast();
    const [server, setServer] = useState(state.sync.server ?? "");
    const [editingServer, setEditingServer] = useState(false);
    const [role, setRole] = useState(state.sync.role ?? "logger");
    const [name, setName] = useState(state.sync.name);
    const [confirm, setConfirm] = useState<"register" | "reupload" | null>(null);
    const [pendingUuids, setPendingUuids] = useState<Set<string>>(() => new Set());
    const [unsubscribeTarget, setUnsubscribeTarget] = useState<MobileDevice | null>(null);
    const devices = useQuery({queryKey: ["mobile-data", "devices"], queryFn: () => request("sync.devices"), enabled: state.sync.active});
    const allDevices = devices.data ?? state.devices ?? [];
    const localDevice = allDevices.find(device => device.is_local) ?? null;
    const remoteDevices = allDevices.filter(device => !device.is_local && (device.available_on_server || device.is_tracking || device.has_local_logs));
    const showVisibilityToggles = remoteDevices.some(device => device.is_tracking || device.has_local_logs);
    const action = () => confirm === "register" ? request("sync.register", {name, role}) : request("sync.reupload");
    const subscribe = async (device: MobileDevice) => {
        setPendingUuids(prev => new Set(prev).add(device.uuid));
        try {
            await act(async () => {
                const result = await request("sync.subscribe", {uuid: device.uuid, name: device.name});
                showToast(result.downloaded > 0 ? `Added ${result.downloaded} logs from ${device.name}` : `Subscribed to ${device.name}`, "success");
            });
        } finally {
            setPendingUuids(prev => { const next = new Set(prev); next.delete(device.uuid); return next; });
        }
    };
    const unsubscribe = async (device: MobileDevice) => {
        setPendingUuids(prev => new Set(prev).add(device.uuid));
        try {
            const ok = await act(() => request("sync.unsubscribe", {uuid: device.uuid}), device.is_tracking ? "Unsubscribed and removed local logs for this device" : "Removed downloaded logs for this device");
            if (ok) setUnsubscribeTarget(null);
        } finally {
            setPendingUuids(prev => { const next = new Set(prev); next.delete(device.uuid); return next; });
        }
    };
    return <>
        <Card>
            <h2>Sync server</h2>
            {!state.sync.server || editingServer ? <form onSubmit={event => {
                event.preventDefault();
                void act(() => request("sync.check", {server}), "Server connected").then(ok => {
                    if (ok) setEditingServer(false);
                });
            }}>
                <label>Server address<input required autoCapitalize="none" autoCorrect="off"
                    value={server} onChange={event => setServer(event.target.value)} /></label>
                <div className="actions">
                    <button className="primary" disabled={busy}>Connect</button>
                    {state.sync.server && <button type="button" disabled={busy} onClick={() => setEditingServer(false)}>Cancel</button>}
                </div>
            </form> : <>
                <div className="row">
                    <code>{state.sync.server}</code>
                    <button disabled={busy} onClick={() => {
                        setServer(state.sync.server ?? "");
                        setEditingServer(true);
                    }}>Change server</button>
                </div>
                {state.sync.active && <div className="row">
                    <span>Next sync {state.sync.nextSyncSeconds == null ? "Scheduled" : duration(state.sync.nextSyncSeconds)}</span>
                    <button className="primary" disabled={busy} onClick={() => void act(async () => {
                        const message = await request("sync.now");
                        showToast(message || "Sync complete", "success");
                    })}>Sync now</button>
                </div>}
            </>}
        </Card>
        {state.sync.server && !editingServer && <Card>
            <div className="row"><h2>This device</h2><span className="status">
                {state.sync.active ? "Active" : state.sync.registered ? "Waiting for approval" : "Unregistered"}
            </span></div>
            {!state.sync.registered ? <>
                <label>Device name<input value={name} onChange={event => setName(event.target.value)} /></label>
                <label>Device role<select value={role} onChange={event => setRole(event.target.value === "consumer" ? "consumer" : "logger")}>
                    <option value="logger">Logger · record and share activity</option>
                    <option value="consumer">Consumer · view other devices’ activity</option>
                </select></label>
                <button className="primary" disabled={busy || !name.trim()} onClick={() => setConfirm("register")}>Register this device</button>
            </> : <>
                <p>{state.sync.role === "consumer" ? "Consumer · local tracking is off" : "Logger"}</p>
                <p className="uuid">{state.sync.uuid}</p>
                {state.sync.active && showVisibilityToggles && localDevice && <div className="device-toggles">
                    <label className="check compact-check"><input type="checkbox" checked={localDevice.in_cal} disabled={busy}
                        onChange={event => void act(() => request("device.update", {uuid: localDevice.uuid, in_cal: event.target.checked}))} />Calendar</label>
                    <label className="check compact-check"><input type="checkbox" checked={localDevice.in_stats} disabled={busy}
                        onChange={event => void act(() => request("device.update", {uuid: localDevice.uuid, in_stats: event.target.checked}))} />Stats</label>
                </div>}
                {!state.sync.active
                    ? <button disabled={busy} onClick={() => void act(() => request("sync.approval"), "Approval checked")}>Check approval</button>
                    : state.sync.role !== "consumer" && <button disabled={busy} onClick={() => setConfirm("reupload")}>Reupload all logs…</button>}
            </>}
        </Card>}
        {state.sync.active && !editingServer && <Card><div className="row"><h2>Other devices</h2><button disabled={devices.isFetching} onClick={() => void devices.refetch()}>{devices.isFetching ? "Refreshing…" : "Refresh"}</button></div><p>Subscribe to a logger to download its activity.</p>{devices.error ? <p role="alert">Could not load devices.</p> : devices.isPending ? <Empty>Loading devices…</Empty> : remoteDevices.map(device => {
            const isLogger = !device.role || device.role === "logger";
            const canSubscribe = isLogger && device.available_on_server && !device.is_tracking;
            const canUnsubscribe = device.is_tracking || ((!device.available_on_server || !isLogger) && device.has_local_logs);
            const pending = pendingUuids.has(device.uuid);
            return <div className="device" key={device.uuid}>
                <div className="device-row">
                    <div className="device-meta"><strong>{device.name}</strong><small>{isLogger ? "Logger" : device.role === "consumer" ? "Consumer" : "Integration"}</small>
                        {!device.available_on_server && device.is_tracking && <small className="device-warning">No longer on server — tracking paused</small>}
                        {!device.available_on_server && !device.is_tracking && device.has_local_logs && <small className="device-warning">No longer on server — downloaded logs kept locally</small>}
                    </div>
                    {(canSubscribe || canUnsubscribe) && <button type="button" className={device.is_tracking ? "primary" : undefined} disabled={busy || pending} onClick={() => {
                        if (canUnsubscribe) setUnsubscribeTarget(device);
                        else void subscribe(device);
                    }}>{pending ? (canUnsubscribe ? "Unsubscribing…" : "Downloading…") : canUnsubscribe ? (device.is_tracking ? "Subscribed" : "Remove logs") : "Subscribe"}</button>}
                </div>
                {(device.is_tracking || device.has_local_logs) && <div className="device-toggles">
                    <label className="check compact-check"><input type="checkbox" checked={device.in_cal} disabled={busy || pending} onChange={event => void act(() => request("device.update", {uuid: device.uuid, in_cal: event.target.checked}))} />Calendar</label>
                    <label className="check compact-check"><input type="checkbox" checked={device.in_stats} disabled={busy || pending} onChange={event => void act(() => request("device.update", {uuid: device.uuid, in_stats: event.target.checked}))} />Stats</label>
                </div>}
            </div>;
        })}{!devices.isPending && !devices.error && remoteDevices.length === 0 && <Empty>No other devices on the server yet.</Empty>}</Card>}
        {confirm && <Modal title={confirm === "register" ? "Register this device?" : "Reupload all logs?"} close={() => setConfirm(null)}>
            <p>{confirm === "reupload" ? "Send all local logs to your configured server again."
                : role === "consumer" ? "After approval, this phone can view activity from other devices. Local tracking will be off."
                : "After approval, this phone can upload its activity."}</p>
            <div className="actions">
                <button disabled={busy} onClick={() => void act(action, "Done").then(ok => { if (ok) setConfirm(null); })}>Continue</button>
                <button onClick={() => setConfirm(null)}>Cancel</button>
            </div>
        </Modal>}
        {unsubscribeTarget && <Modal title={unsubscribeTarget.is_tracking ? "Unsubscribe from device?" : "Remove downloaded logs?"} close={() => setUnsubscribeTarget(null)}><p>{unsubscribeTarget.is_tracking ? `This will stop syncing from ${unsubscribeTarget.name} and delete all of its downloaded logs stored on this phone.` : `Remove all downloaded logs for ${unsubscribeTarget.name} stored on this phone?`}</p><div className="actions"><button className="danger" disabled={busy || pendingUuids.has(unsubscribeTarget.uuid)} onClick={() => void unsubscribe(unsubscribeTarget)}>{pendingUuids.has(unsubscribeTarget.uuid) ? "Removing…" : unsubscribeTarget.is_tracking ? "Unsubscribe" : "Remove logs"}</button><button onClick={() => setUnsubscribeTarget(null)}>Cancel</button></div></Modal>}
    </>;
}

function SettingsScreen(props: ScreenProps & {openSync: () => void}) {
    const {state, act, busy} = props;
    const [settings, setSettings] = useState(state.settings);
    const [skipped, setSkipped] = useState(false);
    const fields: [keyof Settings, string][] = [["day_start_hour", "Day starts at hour (0–23)"], ["min_app_duration", "Minimum app duration (seconds)"], ["min_log_duration", "Minimum log duration (seconds)"], ["max_attach_distance", "Maximum attach distance (seconds)"], ["lookahead_window", "Lookahead window (seconds)"], ["min_timeblock_duration", "Minimum time block (seconds)"]];
    const missingPermissions = (["usage", "browser", "media"] as const).filter(kind => !state.permissions[kind]);
    return <><button onClick={props.openSync}>Sync</button>{state.sync.role !== "consumer" && missingPermissions.length > 0 && <Card><h2>Tracking access</h2>{missingPermissions.map(kind => <div className="permission row" key={kind}><div><strong>{kind === "usage" ? "App usage" : kind === "browser" ? "Browser activity" : "Media playback"}</strong><small>{kind === "usage" ? "Required for tracking" : "Optional"}</small></div><button disabled={busy} onClick={() => void act(() => request("permission", {kind}))}>Enable</button></div>)}</Card>}
        <GoogleCalendarSettings {...props} />
        <Card className="settings-card"><h2>Display and time blocks</h2><form onSubmit={event => { event.preventDefault(); void act(() => request("settings.save", settings), "Settings saved"); }}><label className="check"><input type="checkbox" checked={settings.notes_enabled} onChange={event => setSettings({...settings, notes_enabled: event.target.checked})} />Show Notes</label><label className="check"><input type="checkbox" checked={settings.use_bar_usage_chart} onChange={event => setSettings({...settings, use_bar_usage_chart: event.target.checked})} />Use bar chart by default</label>{fields.map(([key, label]) => <label className="settings-field" key={key}>{label}<input type="number" min={0} max={key === "day_start_hour" ? 23 : 86400} required value={String(settings[key])} onChange={event => setSettings({...settings, [key]: event.target.value === "" ? "" : Number(event.target.value)})} /></label>)}<button className="primary" disabled={busy}>Save settings</button></form></Card>
        <button onClick={() => setSkipped(true)}>Manage skipped apps</button><p className="muted">Time Tracker {state.version}</p>
        {skipped && <SkippedApps {...props} close={() => setSkipped(false)} />}
    </>;
}

function GoogleCalendarSettings({state, act, busy}: ScreenProps) {
    const google = state.googleCalendar;
    const sources = useQuery({
        queryKey: ["mobile-data", "google-sources"],
        queryFn: () => request("calendar.sources"),
        enabled: !!google?.allowed,
        gcTime: 0,
        refetchInterval: 15000,
    });
    return <Card className="settings-card">
        <h2>Google Calendar import</h2>
        {!google?.allowed ? <>
            <p>Allow read-only access to choose Google calendars synced to this phone.</p>
            <button disabled={busy} onClick={() => void act(() => request("calendar.permission"))}>Allow calendar access</button>
        </> : <>
            {sources.isPending && <p role="status">Loading calendars…</p>}
            {sources.error && <p role="alert">Could not load Google calendars. <button onClick={() => void sources.refetch()}>Retry</button></p>}
            {sources.isSuccess && sources.data.length === 0 && <p>No Google calendars found. Enable Calendar sync for your Google account in Android Settings.</p>}
            {sources.data?.map(source => <label key={source.key} className="check calendar-source">
                <input type="checkbox" checked={google.selected.includes(source.key)} disabled={busy}
                    onChange={event => {
                        const selected = event.target.checked;
                        void act(() => request("calendar.select", {key: source.key, selected}));
                    }} />
                <span>{source.name}<small>{source.account}</small></span>
            </label>)}
        </>}
    </Card>;
}

function SkippedApps({close, act, busy}: ScreenProps & {close: () => void}) {
    const [pattern, setPattern] = useState("");
    const [confirm, setConfirm] = useState<{kind: "add" | "remove" | "clear"; id?: number; count?: number} | null>(null);
    const list = useQuery({queryKey: ["mobile-data", "skipped"], queryFn: () => request("skipped.list")});
    const add = async () => {
        if (!pattern.trim()) return;
        await act(async () => { const count = await request("skipped.count", {pattern: pattern.trim()}); setConfirm({kind: "add", count}); });
    };
    const commit = () => act(() => confirm?.kind === "add" ? request("skipped.add", {pattern: pattern.trim()}) : confirm?.kind === "remove" ? request("skipped.delete", {id: confirm.id!}) : request("skipped.clear"), "Skipped apps updated").then(ok => { if (ok) { setConfirm(null); setPattern(""); } });
    return <Modal title="Skipped apps" close={close}>{confirm ? <div className="confirmation"><p>{confirm.kind === "add" ? `Skip “${pattern}”? This also deletes ${confirm.count} existing matching logs and queues those deletions for sync.` : confirm.kind === "clear" ? "Remove all skip patterns? Existing logs will stay saved." : "Remove this skip pattern?"}</p><div className="actions"><button className="danger" disabled={busy} onClick={() => void commit()}>Confirm</button><button onClick={() => setConfirm(null)}>Cancel</button></div></div> : <><form onSubmit={event => { event.preventDefault(); void add(); }}><label>Package, app label, or pattern<input value={pattern} maxLength={500} required onChange={event => setPattern(event.target.value)} /></label><button disabled={busy}>Add pattern…</button></form>{list.error && <p role="alert">Could not load skipped apps.</p>}{list.data?.map(row => <div className="row permission" key={row.id}><code>{row.pattern}</code><button aria-label={`Remove ${row.pattern}`} onClick={() => setConfirm({kind: "remove", id: row.id})}>Remove</button></div>)}{!list.data?.length && <Empty>No skipped apps.</Empty>}{!!list.data?.length && <button className="danger" onClick={() => setConfirm({kind: "clear"})}>Clear all patterns…</button>}</>}</Modal>;
}
