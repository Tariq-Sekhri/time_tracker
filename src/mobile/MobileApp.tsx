import {useEffect, useRef, useState, type ReactNode} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import Notes from "../Screens/Notes";
import {DonutChart} from "../Screens/Calander/DonutChart";
import {useToast} from "../Componants/Toast";
import CategoryPicker from "./CategoryPicker";
import {request, type MobileLog, type MobileState, type Settings, type Usage} from "./api";
import {calendarBlocks, clipLog, colorFor, dateAtHour, dateValue, dayStart, duration, nextDay, rangeFor} from "./model";

type Page = "Usage" | "Logs" | "Calendar" | "Statistics" | "Sync" | "Notes" | "Settings";
const pages: Page[] = ["Usage", "Logs", "Calendar", "Statistics", "Sync", "Notes", "Settings"];

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
        Statistics: "M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7",
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
    const visiblePages = pages.filter(item => item !== "Notes" || state.data.settings.notes_enabled);
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
        <header className="app-header"><div><small>TIME TRACKER</small><h1>{page}</h1></div><span className={`status ${state.data.permissions.usage ? "active" : ""}`}>{state.data.permissions.usage ? "Tracking" : "Setup needed"}</span></header>
        {state.error && <div className="error" role="alert">Could not refresh app status. <button onClick={() => void state.refetch()}>Retry</button></div>}
        <div ref={viewport} className="page-viewport"
            onTouchStart={event => {
                swipe.current = null;
                const target = event.target as HTMLElement;
                if (drag.settling || event.touches.length !== 1 || target.closest('dialog, input, textarea, select, [role="slider"]')) return;
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
            {visiblePages.filter(item => item === page || item === drag.target).map(item => {
                const side = item === page ? 0 : visiblePages.indexOf(item) > visiblePages.indexOf(page) ? 100 : -100;
                return <main key={item} className={`swipe-page ${item === "Notes" ? "notes-page" : "page-content"}`}
                    aria-hidden={item !== page} inert={item !== page}
                    style={{transform: `translateX(calc(${side}% + ${drag.offset}px))`, transition: drag.settling ? "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)" : "none"}}>
            {!state.data.permissions.usage && item !== "Settings" && <Card><h2>Enable app usage tracking</h2><p>Allow Usage Access to record app activity. Browser and media tracking are optional.</p><button className="primary" disabled={busy} onClick={() => void act(() => request("permission", {kind: "usage"}))}>Open Usage Access</button></Card>}
            {item === "Usage" && <UsageScreen {...shared} />}
            {item === "Logs" && <LogsScreen {...shared} />}
            {item === "Calendar" && <CalendarScreen {...shared} />}
            {item === "Statistics" && <UsageScreen {...shared} statistics />}
            {item === "Sync" && <SyncScreen {...shared} />}
            {item === "Notes" && <MobileNotes />}
            {item === "Settings" && <SettingsScreen {...shared} />}
                </main>;
            })}
        </div>
        <nav className="bottom-nav" aria-label="Main navigation">{visiblePages.map(item => <button key={item} aria-current={page === item ? "page" : undefined} onClick={() => navigate(item)}><NavIcon page={item} /><span>{item === "Statistics" ? "Stats" : item}</span></button>)}</nav>
    </div>;
}

type ScreenProps = {state: MobileState; busy: boolean; act: (work: () => Promise<unknown>, message?: string) => Promise<boolean>};
type ManualBlock = MobileState["manualEntries"][number] & {running: boolean};

function MobileNotes() {
    const [link, setLink] = useState<string | null>(null);
    const resolve = useRef<((value: string | null) => void) | null>(null);
    useEffect(() => () => { resolve.current?.(null); }, []);
    const finish = (value: string | null) => { resolve.current?.(value); resolve.current = null; setLink(null); };
    return <><Notes showHeading={false} requestLink={() => new Promise<string | null>(done => { resolve.current = done; setLink(""); })} />
        {link !== null && <Modal title="Add link" close={() => finish(null)}><form onSubmit={event => { event.preventDefault(); finish(link); }}><label>Link address<input type="url" required autoFocus placeholder="https://example.com" value={link} onChange={event => setLink(event.target.value)} /></label><button className="primary">Insert link</button></form></Modal>}
    </>;
}

function TimerCard({state, act, busy}: ScreenProps) {
    const [title, setTitle] = useState(state.timer?.title ?? "");
    const [project, setProject] = useState(state.timer?.project_name ?? "");
    const [editing, setEditing] = useState(false);
    useEffect(() => { if (!editing) { setTitle(state.timer?.title ?? ""); setProject(state.timer?.project_name ?? ""); } }, [state.timer?.session_id, state.timer?.title, state.timer?.project_name]);
    const createCategory = async (name: string, parent: string | null) => {
        let saved: string | null = null;
        await act(async () => { saved = await request("manual.category.create", {name, parent}); }, "Category created");
        return saved;
    };
    return <Card><div className="row"><h2>Manual timer</h2><span className="muted">{state.timer ? duration(Date.now() / 1000 - state.timer.start_time) : "Ready"}</span></div>
        <>
            {state.timerStatus !== "CONNECTED" && <p role="status">Timers are saved on this phone. Recorded sessions will upload when sync connects.</p>}
            <label>What are you working on?<input value={title} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={event => setTitle(event.target.value)} /></label>
            <div className="field">Category<CategoryPicker categories={state.projects} value={project} onChange={setProject} onCreate={createCategory} /></div>
            <div className="actions"><button className="primary" disabled={busy} onClick={() => void act(() => request("timer.save", {title, project: project || null}), state.timer ? "Timer updated" : "Timer started")}>{state.timer ? "Save details" : "Start timer"}</button>
                {state.timer && <button disabled={busy} onClick={() => void act(() => request("timer.stop", {title, project: project || null}), "Time recorded")}>Stop and record</button>}</div>
        </>
        {(state.manualEntries?.length ?? 0) > 0 && <div className="manual-history"><h3>Recorded sessions</h3>{state.manualEntries.slice(-5).reverse().map(entry => <div className="usage-row" key={entry.session_id}>
            <div className="row"><strong>{entry.title || "Untitled session"}</strong><span>{duration(entry.end_time - entry.start_time)}</span></div>
            <small>{new Date(entry.start_time * 1000).toLocaleString()}{entry.project_name ? ` / ${entry.project_name}` : ""} / {entry.synced ? "Synced" : "Saved on phone / Waiting to sync"}</small>
        </div>)}</div>}
    </Card>;
}

function DateRange({start, end, setStart, setEnd}: {start: string; end: string; setStart: (date: string) => void; setEnd: (date: string) => void}) {
    return <div className="date-range"><label>From<input type="date" value={start} max={end} onChange={event => { if (event.target.value) setStart(event.target.value); }} /></label><label>Through<input type="date" value={end} min={start} max={dateValue(new Date())} onChange={event => { if (event.target.value) setEnd(event.target.value); }} /></label></div>;
}

function UsageScreen({statistics = false, ...props}: ScreenProps & {statistics?: boolean}) {
    const {state} = props;
    const today = dateValue(dayStart(new Date(), state.settings.day_start_hour));
    const [period, setPeriod] = useState(statistics ? "Custom" : "Today");
    const [start, setStart] = useState(statistics && state.firstLogMs ? dateValue(dayStart(new Date(state.firstLogMs), state.settings.day_start_hour)) : today);
    const [end, setEnd] = useState(today);
    const [browserOnly, setBrowserOnly] = useState(false);
    const [average, setAverage] = useState(statistics);
    const [chart, setChart] = useState(state.settings.use_bar_usage_chart ? "Bars" : "Donut");
    const [showAll, setShowAll] = useState(false);
    const range = rangeFor(period, new Date(), state.settings.day_start_hour, start, end);
    const usage = useQuery({queryKey: ["mobile-data", "usage", range, browserOnly], queryFn: () => request("usage", {...range, browserOnly}), refetchInterval: 15000});
    const days = Math.max(1, Math.round((Date.UTC(...dateParts(dateValue(new Date(range.endMs - 1)))) - Date.UTC(...dateParts(dateValue(new Date(range.startMs))))) / 86400000) + 1);
    const divisor = average ? days : 1;
    const slices = usage.data?.apps.filter(app => app.seconds >= state.settings.min_app_duration).map(app => ({...app, seconds: app.seconds / divisor})) ?? [];
    const total = (usage.data?.total ?? 0) / divisor;
    return <>
        {!statistics && <TimerCard {...props} />}
        <div className="segments" aria-label="Usage period">{["Today", "Week", "Month", "Custom"].map(item => <button key={item} aria-pressed={period === item} onClick={() => { setPeriod(item); setShowAll(false); }}>{item}</button>)}</div>
        {period === "Custom" && <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />}
        {statistics && <div className="segments"><button aria-pressed={average} onClick={() => setAverage(true)}>Daily average</button><button aria-pressed={!average} onClick={() => setAverage(false)}>Total</button></div>}
        <Card><small>{average ? "AVERAGE PER DAY" : "TRACKED TIME"}</small><div className="big-number">{duration(total)}</div><p>{state.firstLogMs && statistics ? `Tracking since ${new Date(state.firstLogMs).toLocaleDateString()}` : "Activity recorded on this phone"}</p></Card>
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

function DayPicker({day, setDay, hour}: {day: string; setDay: (value: string) => void; hour: number}) {
    const today = dateValue(dayStart(new Date(), hour));
    const shift = (amount: number) => { const date = dateAtHour(day, hour); date.setDate(date.getDate() + amount); setDay(dateValue(date)); };
    return <div className="day-picker"><button onClick={() => shift(-1)} aria-label="Previous day">‹</button><input type="date" aria-label="Selected day" value={day} max={today} onChange={event => { if (event.target.value) setDay(event.target.value); }} /><button disabled={day >= today} onClick={() => shift(1)} aria-label="Next day">›</button><button disabled={day === today} onClick={() => setDay(today)}>Today</button></div>;
}

function LogDetails({log, close, act, busy}: {log: MobileLog; close: () => void} & Pick<ScreenProps, "act" | "busy">) {
    const [confirm, setConfirm] = useState(false);
    return <Modal title={log.app_label || log.app_name} close={close}><dl className="log-details">{Object.entries(log).filter(([, value]) => value != null).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{typeof value === "number" && /timestamp|time_used|install_time|update_time/.test(key) ? new Date(value).toLocaleString() : String(value)}</dd></div>)}</dl>
        {confirm ? <div className="confirmation"><p>Delete this log? Its deletion will also be uploaded on the next sync.</p><button className="danger" disabled={busy} onClick={() => void act(() => request("log.delete", {id: log.id}), "Log deleted").then(ok => { if (ok) close(); })}>Delete log</button><button onClick={() => setConfirm(false)}>Keep log</button></div> : <button className="danger" onClick={() => setConfirm(true)}>Delete log…</button>}
    </Modal>;
}

function LogsScreen(props: ScreenProps) {
    const hour = props.state.settings.day_start_hour;
    const [day, setDay] = useState(dateValue(dayStart(new Date(), hour)));
    const [limit, setLimit] = useState(100);
    const [selected, setSelected] = useState<MobileLog | null>(null);
    const start = dateAtHour(day, hour), end = nextDay(start);
    const logs = useQuery({queryKey: ["mobile-data", "logs", day, hour, limit], queryFn: async () => {
        const rows: MobileLog[] = [];
        while (rows.length <= limit) {
            const batch = await request("logs", {startMs: +start, endMs: +end, offset: rows.length, limit: Math.min(500, limit + 1 - rows.length)});
            rows.push(...batch);
            if (batch.length === 0 || rows.length > limit) break;
        }
        return rows;
    }, refetchInterval: 5000});
    return <><DayPicker day={day} setDay={value => { setDay(value); setLimit(100); }} hour={hour} /><div className="row"><p className="muted">Local app, browser, and media activity</p><button disabled={props.busy} onClick={() => void props.act(() => request("import"))}>Refresh</button></div>
        {logs.error && <p role="alert">Could not load logs. <button onClick={() => void logs.refetch()}>Retry</button></p>}
        {logs.isPending ? <Empty>Loading activity…</Empty> : !logs.data?.length ? <Empty>No activity recorded for this day.</Empty> : <div className="log-list">{logs.data.slice(0, limit).map(log => <button key={log.id} className="log-row" onClick={() => setSelected(log)}><span className="dot" style={{background: colorFor(log.package_name)}} /><span className="app-label"><strong>{log.app_label || log.app_name}</strong><small>{log.app_name} · {new Date(log.start_timestamp).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}</small></span><span>{duration(clipLog(log, +start, +end).duration)}</span></button>)}</div>}
        {(logs.data?.length ?? 0) > limit && <button onClick={() => setLimit(limit + 100)}>Show more logs</button>}
        {selected && <LogDetails log={selected} close={() => setSelected(null)} {...props} />}
    </>;
}

function CalendarScreen(props: ScreenProps) {
    const hour = props.state.settings.day_start_hour;
    const [day, setDay] = useState(dateValue(dayStart(new Date(), hour)));
    const [zoom, setZoom] = useState(1);
    const [selected, setSelected] = useState<MobileLog[] | null>(null);
    const [detail, setDetail] = useState<MobileLog | null>(null);
    const start = dateAtHour(day, hour), end = nextDay(start);
    const logs = useQuery({queryKey: ["mobile-data", "calendar", day, hour], queryFn: async () => {
        const rows = new Map<number, MobileLog>(); let offset = 0;
        for (;;) {
            const batch = await request("logs", {startMs: +start, endMs: +end, offset, limit: 500});
            batch.forEach(log => rows.set(log.id, log));
            if (batch.length < 500) return [...rows.values()];
            offset += batch.length;
        }
    }, refetchInterval: 15000});
    const blocks = calendarBlocks(logs.data ?? [], +start, +end, props.state.settings);
    const [manual, setManual] = useState<ManualBlock | null>(null);
    const {timer, manualEntries = [], projects} = props.state;
    const manualBlocks: ManualBlock[] = [...manualEntries.map(entry => ({...entry, running: false})), ...(timer ? [{...timer, end_time: Date.now() / 1000, synced: false, running: true}] : [])]
        .filter(entry => entry.end_time * 1000 > +start && entry.start_time * 1000 < +end);
    const manualColor = (project: string | null) => project ? projects.find(item => item.name === project)?.color ?? "#a78bfa" : "#64748b";
    const events = [
        ...blocks.map(block => ({id: block.id, title: `${block.title} · ${duration(block.activeSeconds)}`, start: new Date(block.start), end: new Date(block.end), backgroundColor: colorFor(block.packageName), borderColor: "transparent", textColor: "#111318", extendedProps: {logs: block.logs}})),
        ...manualBlocks.map(entry => ({id: `manual-${entry.session_id}`, title: `${entry.running ? "● " : ""}${entry.title || "Untitled session"}${entry.project_name ? ` · ${entry.project_name}` : ""} · ${duration(entry.end_time - entry.start_time)}`, start: new Date(Math.max(+start, entry.start_time * 1000)), end: new Date(Math.min(+end, entry.end_time * 1000)), backgroundColor: manualColor(entry.project_name), borderColor: "#f2f3f7", textColor: "#111318", classNames: ["manual-event"], extendedProps: {manual: entry}})),
    ];
    return <><DayPicker day={day} setDay={setDay} hour={hour} /><div className="row"><p className="muted">Tap a time block for its activity</p><div className="actions"><button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => value - 0.5)}>−</button><button aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(value => value + 0.5)}>+</button></div></div>
        {logs.error && <p role="alert">Could not load calendar. <button onClick={() => void logs.refetch()}>Retry</button></p>}
        {logs.isPending ? <Empty>Loading calendar…</Empty> : <div className="mobile-calendar" style={{"--slot-height": `${28 * zoom}px`} as React.CSSProperties}><FullCalendar key={`${day}:${hour}`} plugins={[timeGridPlugin, interactionPlugin]} initialView="timeGridDay" initialDate={day} headerToolbar={false} allDaySlot={false} dayHeaders={false} height="auto" slotMinTime={`${String(hour).padStart(2, "0")}:00:00`} slotMaxTime={`${hour + 24}:00:00`} scrollTime={`${hour}:00:00`} nowIndicator events={events} eventClick={event => { const entry = event.event.extendedProps.manual as ManualBlock | undefined; if (entry) setManual(entry); else setSelected(event.event.extendedProps.logs as MobileLog[]); }} /></div>}
        {!logs.isPending && !events.length && <p className="muted">No time blocks match the detection settings for this day.</p>}
        {manual && <Modal title={manual.running ? "Running timer" : "Manual time"} close={() => setManual(null)}><dl className="log-details">
            {([["Title", manual.title || "Untitled session"], ["Category", manual.project_name || "Uncategorized"], ["Start", new Date(manual.start_time * 1000).toLocaleString()], ["End", manual.running ? "Running" : new Date(manual.end_time * 1000).toLocaleString()], ["Duration", duration(manual.end_time - manual.start_time)], ["Status", manual.running ? "Recording" : manual.synced ? "Synced" : "Saved on phone / Waiting to sync"]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl></Modal>}
        {selected && !detail && <Modal title="Time block activity" close={() => setSelected(null)}>{selected.map(log => <button className="log-row" key={log.id} onClick={() => setDetail(log)}><span className="app-label">{log.app_label || log.app_name}<small>{new Date(log.start_timestamp).toLocaleTimeString()}</small></span><span>{duration(log.duration)}</span></button>)}</Modal>}
        {detail && <LogDetails log={detail} close={() => { setDetail(null); setSelected(null); }} {...props} />}
    </>;
}

function SyncScreen({state, act, busy}: ScreenProps) {
    const [server, setServer] = useState(state.sync.server ?? "");
    const [name, setName] = useState(state.sync.name);
    const [confirm, setConfirm] = useState<"register" | "change" | "reupload" | null>(null);
    const devices = useQuery({queryKey: ["mobile-data", "devices"], queryFn: () => request("sync.devices"), enabled: state.sync.active});
    const action = () => confirm === "register" ? request("sync.register", {name}) : confirm === "change" ? request("sync.change") : request("sync.reupload");
    return <>
        <Card><h2>Sync server</h2>{!state.sync.server ? <form onSubmit={event => { event.preventDefault(); void act(() => request("sync.check", {server}), "Server connected"); }}><label>Server address<input required autoCapitalize="none" autoCorrect="off" placeholder="192.168.1.10" value={server} onChange={event => setServer(event.target.value)} /></label><button className="primary" disabled={busy}>Connect</button></form> : <><div className="row"><code>{state.sync.server}</code><button disabled={busy} onClick={() => setConfirm("change")}>Change server</button></div><p>Upload this phone’s logs and sync shared notes and timers.</p>{state.sync.active && <div className="row"><span>Next sync: {state.sync.nextSyncSeconds == null ? "Scheduled" : duration(state.sync.nextSyncSeconds)}</span><button className="primary" disabled={busy} onClick={() => void act(() => request("sync.now"), "Sync complete")}>Sync now</button></div>}</>}</Card>
        {state.sync.server && <Card><div className="row"><h2>This device</h2><span className="status">{state.sync.active ? "Active" : state.sync.registered ? "Waiting for approval" : "Unregistered"}</span></div>{!state.sync.registered ? <><label>Device name<input value={name} onChange={event => setName(event.target.value)} /></label><button className="primary" disabled={busy || !name.trim()} onClick={() => setConfirm("register")}>Register this device</button></> : <><p className="uuid">{state.sync.uuid}</p>{!state.sync.active ? <button disabled={busy} onClick={() => void act(() => request("sync.approval"), "Approval checked")}>Check approval</button> : <button disabled={busy} onClick={() => setConfirm("reupload")}>Reupload all logs…</button>}</>}</Card>}
        {state.sync.active && <Card><div className="row"><h2>Other devices</h2><button onClick={() => void devices.refetch()}>Refresh</button></div><p>Device subscriptions are unavailable on mobile.</p>{devices.error ? <p role="alert">Could not load devices.</p> : devices.isPending ? <Empty>Loading devices…</Empty> : devices.data?.filter(device => device.uuid !== state.sync.uuid).map(device => <div className="device" key={device.uuid}><strong>{device.name}</strong><small>{device.uuid}</small></div>)}{devices.data?.filter(device => device.uuid !== state.sync.uuid).length === 0 && <Empty>No other devices.</Empty>}</Card>}
        {confirm && <Modal title={confirm === "register" ? "Register this device?" : confirm === "change" ? "Change sync server?" : "Reupload all logs?"} close={() => setConfirm(null)}><p>{confirm === "register" ? "Registering enables this phone to upload its logs after server approval." : confirm === "change" ? "This disconnects the current registration. Your local logs and notes remain saved." : "Send all local logs to your configured server again."}</p><div className="actions"><button disabled={busy} onClick={() => void act(action, "Done").then(ok => { if (ok) setConfirm(null); })}>Continue</button><button onClick={() => setConfirm(null)}>Cancel</button></div></Modal>}
    </>;
}

function SettingsScreen(props: ScreenProps) {
    const {state, act, busy} = props;
    const [settings, setSettings] = useState(state.settings);
    const [skipped, setSkipped] = useState(false);
    const fields: [keyof Settings, string][] = [["day_start_hour", "Day starts at hour (0–23)"], ["min_app_duration", "Minimum app duration (seconds)"], ["min_log_duration", "Minimum log duration (seconds)"], ["max_attach_distance", "Maximum attach distance (seconds)"], ["lookahead_window", "Lookahead window (seconds)"], ["min_timeblock_duration", "Minimum time block (seconds)"]];
    return <><Card><h2>Tracking access</h2>{(["usage", "browser", "media"] as const).map(kind => <div className="permission row" key={kind}><div><strong>{kind === "usage" ? "App usage" : kind === "browser" ? "Browser activity" : "Media playback"}</strong><small>{state.permissions[kind] ? "Enabled" : kind === "usage" ? "Required for tracking" : "Optional"}</small></div><button disabled={busy} onClick={() => void act(() => request("permission", {kind}))}>{state.permissions[kind] ? "Manage" : "Enable"}</button></div>)}</Card>
        <Card><h2>Display and time blocks</h2><form onSubmit={event => { event.preventDefault(); void act(() => request("settings.save", settings), "Settings saved"); }}><label className="check"><input type="checkbox" checked={settings.notes_enabled} onChange={event => setSettings({...settings, notes_enabled: event.target.checked})} />Show Notes</label><p>Hiding Notes preserves saved notes and syncing.</p><label className="check"><input type="checkbox" checked={settings.use_bar_usage_chart} onChange={event => setSettings({...settings, use_bar_usage_chart: event.target.checked})} />Use bar chart by default</label>{fields.map(([key, label]) => <label key={key}>{label}<input type="number" min={0} max={key === "day_start_hour" ? 23 : 86400} required value={String(settings[key])} onChange={event => setSettings({...settings, [key]: event.target.value === "" ? "" : Number(event.target.value)})} /></label>)}<button className="primary" disabled={busy}>Save settings</button></form></Card>
        <Card><h2>Skipped apps</h2><p>Exclude app packages, labels, or matching patterns from tracking.</p><button onClick={() => setSkipped(true)}>Manage skipped apps</button></Card><p className="muted">Time Tracker {state.version}</p>
        {skipped && <SkippedApps {...props} close={() => setSkipped(false)} />}
    </>;
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
