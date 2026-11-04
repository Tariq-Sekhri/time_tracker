import {useEffect, useId, useRef, useState, type ReactNode} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import Notes from "../Screens/Notes";
import {DonutChart} from "../Screens/Calander/DonutChart";
import {useToast} from "../Componants/Toast";
import CategoryPicker from "./CategoryPicker";
import ManualPopover from "../Componants/ManualPopover";
import {request, type MobileLog, type MobileState, type Settings, type Usage} from "./api";
import {calendarBlocks, clipLog, colorFor, dateAtHour, dateValue, dayStart, duration, manualUsage, nextDay, palette, rangeFor, rangeDayCount} from "./model";

const stamp = (ms: number) => new Date(ms).toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"});
const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

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
    return <dialog onClick={event => { if (title === "More" && event.target === event.currentTarget) close(); }} onCancel={event => { event.preventDefault(); close(); }} aria-label={title}>
        <div className="row"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>{children}
    </dialog>;
}

function Choice({label, value, options, onChange, className = ""}: {label: string; value: string; options: [string, string][]; onChange: (value: string) => void; className?: string}) {
    const ref = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const id = useId();
    const current = options.find(([key]) => key === value)?.[1] ?? value;
    return <><button ref={ref} type="button" className={`choice ${className}`} aria-label={`${label}: ${current}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><span>{current}</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        {open && <ManualPopover portalRoot={ref.current?.closest("dialog") ?? undefined} anchor={ref.current} onClose={() => setOpen(false)} labelledBy={id} width={Math.max(ref.current?.offsetWidth ?? 0, 190)}><div role="listbox" id={id} aria-label={label} className="choice-list">{options.map(([key, text]) => <button key={key} type="button" role="option" aria-selected={key === value} onClick={() => { onChange(key); setOpen(false); ref.current?.focus(); }}><span>{text}</span>{key === value && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>}</button>)}</div></ManualPopover>}
    </>;
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
    const [moreOpen, setMoreOpen] = useState(false);
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
        <header className="app-header"><div><h1>{page}</h1></div><span className={`status ${state.data.permissions.usage ? "active" : ""}`}>{state.data.permissions.usage ? "Tracking" : "Setup needed"}</span></header>
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
        <nav className="bottom-nav" aria-label="Main navigation">{visiblePages.filter(item => ["Usage", "Logs", "Calendar", "Statistics"].includes(item)).map(item => <button key={item} aria-current={page === item ? "page" : undefined} onClick={() => navigate(item)}><NavIcon page={item} /><span>{item === "Statistics" ? "Stats" : item}</span></button>)}<button aria-label="More" aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={["Sync", "Notes", "Settings"].includes(page) ? "page" : undefined} onClick={() => setMoreOpen(true)}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg><span>More</span></button></nav>
        {moreOpen && <Modal title="More" close={() => setMoreOpen(false)}><div className="more-destinations">{visiblePages.filter(item => ["Notes", "Sync", "Settings"].includes(item)).map(item => <button key={item} aria-current={page === item ? "page" : undefined} onClick={() => { setMoreOpen(false); navigate(item); }}><NavIcon page={item}/>{item}</button>)}</div></Modal>}
    </div>;
}

type ScreenProps = {state: MobileState; busy: boolean; act: (work: () => Promise<unknown>, message?: string) => Promise<boolean>};
type ManualBlock = MobileState["manualEntries"][number] & {running: boolean};

function MobileNotes() {
    const [link, setLink] = useState<string | null>(null);
    const resolve = useRef<((value: string | null) => void) | null>(null);
    useEffect(() => () => { resolve.current?.(null); }, []);
    const finish = (value: string | null) => { resolve.current?.(value); resolve.current = null; setLink(null); };
    return <><Notes compactToolbar showHeading={false} requestLink={() => new Promise<string | null>(done => { resolve.current = done; setLink(""); })} />
        {link !== null && <Modal title="Add link" close={() => finish(null)}><form onSubmit={event => { event.preventDefault(); finish(link); }}><label>Link address<input type="url" required autoFocus placeholder="https://example.com" value={link} onChange={event => setLink(event.target.value)} /></label><button className="primary">Insert link</button></form></Modal>}
    </>;
}

function TimerCard({state, act, busy}: ScreenProps) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(state.timer?.title ?? "");
    const lastCategory = state.manualEntries?.[state.manualEntries.length - 1]?.project_name ?? "";
    const [project, setProject] = useState(state.timer ? state.timer.project_name ?? "" : lastCategory);
    const [allHistory, setAllHistory] = useState(false);
    useEffect(() => { if (!open) { setTitle(state.timer?.title ?? ""); setProject(state.timer ? state.timer.project_name ?? "" : lastCategory); } }, [open, state.timer?.session_id, state.timer?.title, state.timer?.project_name, lastCategory]);
    const createCategory = async (name: string, parent: string | null) => {
        let saved: string | null = null;
        await act(async () => { saved = await request("manual.category.create", {name, parent}); }, "Category created");
        return saved;
    };
    const save = () => void act(() => request("timer.save", {title, project: project || null}), state.timer ? "Timer updated" : "Timer started").then(ok => { if (ok) setOpen(false); });
    const history = [...(state.manualEntries ?? [])].reverse();
    const recent = history.filter((entry, index) => entry.title && history.findIndex(other => other.title === entry.title) === index).slice(0, 3);
    const categoryColor = (name: string | null | undefined) => state.projects.find(item => item.name === name)?.color ?? "#687287";
    return <><Card className="timer-strip"><button className="timer-open" onClick={() => setOpen(true)} aria-label={state.timer ? "Edit timer and view history" : "Start timer or view history"}><span><strong>{state.timer?.title || "Manual timer"}</strong><small>{state.timer ? <><span className="dot" style={{background: categoryColor(state.timer.project_name)}} />{`${state.timer.project_name || "Uncategorized"} · ${duration(Date.now() / 1000 - state.timer.start_time)}`}</> : "Start a timer · History"}</small></span><span aria-hidden="true">›</span></button>{state.timer && <button className="primary" disabled={busy} aria-label="Stop and record timer" onClick={() => void act(() => request("timer.stop", {title: state.timer!.title, project: state.timer!.project_name}), "Time recorded")}>Stop</button>}</Card>
        {open && <Modal title={state.timer ? "Edit timer" : "Start timer"} close={() => setOpen(false)}><div className="timer-editor">{!state.timer && recent.length > 0 && <div className="recent-tasks" role="group" aria-label="Recent tasks">{recent.map(entry => <button type="button" key={entry.session_id} aria-pressed={title === entry.title} onClick={() => { setTitle(entry.title); setProject(entry.project_name ?? ""); }}><span className="dot" style={{background: categoryColor(entry.project_name)}} />{entry.title}</button>)}</div>}<label>Task<input aria-label="Task" autoFocus onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); save(); } }} value={title} onChange={event => setTitle(event.target.value)} placeholder="What are you working on?" /></label><div className="field">Category <span className="muted">(optional)</span><CategoryPicker categories={state.projects} value={project} onChange={setProject} onCreate={createCategory} /></div><button type="button" className="primary wide" disabled={busy} onClick={save}>{state.timer ? "Save details" : "Start timer"}</button></div>
            <details className="manual-history"><summary>Past sessions ({history.length})</summary>{(allHistory ? history : history.slice(0, 5)).map(entry => <div className="usage-row" key={entry.session_id}><div className="row"><strong>{entry.title || "Untitled session"}</strong><span>{duration(entry.end_time - entry.start_time)}</span></div><small>{stamp(entry.start_time * 1000)}{entry.project_name ? ` · ${entry.project_name}` : ""}</small><small>{entry.synced ? "Synced" : "Saved locally · Waiting to sync"}</small></div>)}{!allHistory && history.length > 5 && <button className="wide" onClick={() => setAllHistory(true)}>Show all {history.length} sessions</button>}</details>
        </Modal>}
    </>;
}

function DateField({label, value, onChange, min, max, range, className = ""}: {label: string; value: string; onChange: (value: string) => void; min?: string; max?: string; range?: [string, string]; className?: string}) {
    const ref = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(value.slice(0, 7));
    const id = useId();
    const [year, monthIndex] = month.split("-").map(Number);
    const lead = (new Date(year, monthIndex - 1, 1).getDay() + 6) % 7, count = new Date(year, monthIndex, 0).getDate();
    const shift = (amount: number) => setMonth(dateValue(new Date(year, monthIndex - 1 + amount, 1)).slice(0, 7));
    const selected = new Date(`${value}T12:00`);
    const text = selected.toLocaleDateString([], {weekday: "short", month: "short", day: "numeric", ...(selected.getFullYear() !== new Date().getFullYear() ? {year: "numeric"} : {})});
    const allowed = (date: string) => (!min || date >= min) && (!max || date <= max);
    const close = () => setOpen(false);
    return <><button ref={ref} type="button" className={`choice date-field ${className}`} aria-label={`${label}: ${selected.toLocaleDateString([], {dateStyle: "full"})}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) setMonth(value.slice(0, 7)); setOpen(!open); }}><span>{text}</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v16H4zM4 10h16M8 3v4M16 3v4"/></svg></button>
        {open && <ManualPopover anchor={ref.current} onClose={close} labelledBy={id} width={328}><div className="date-popover">
            <div className="row"><button type="button" className="icon-button" aria-label="Previous month" onClick={() => shift(-1)}>‹</button><strong id={id}>{new Date(year, monthIndex - 1, 1).toLocaleDateString([], {month: "long", year: "numeric"})}</strong><button type="button" className="icon-button" aria-label="Next month" disabled={!!max && month >= max.slice(0, 7)} onClick={() => shift(1)}>›</button></div>
            <div className="date-grid">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <small key={index} aria-hidden="true">{day}</small>)}{Array.from({length: lead}, (_, index) => <span key={`lead-${index}`} />)}{Array.from({length: count}, (_, index) => {
                const date = `${month}-${String(index + 1).padStart(2, "0")}`;
                return <button key={date} type="button" aria-label={new Date(`${date}T12:00`).toLocaleDateString([], {dateStyle: "full"})} aria-pressed={date === value} data-range={range && date >= range[0] && date <= range[1] ? "" : undefined} aria-current={max && date === max ? "date" : undefined} disabled={!allowed(date)} onClick={() => { onChange(date); close(); ref.current?.focus(); }}>{index + 1}</button>;
            })}</div>
        </div></ManualPopover>}
    </>;
}

function DateRange({start, end, setStart, setEnd}: {start: string; end: string; setStart: (date: string) => void; setEnd: (date: string) => void}) {
    return <div className="date-range"><div className="field">From<DateField label="From" value={start} max={end} range={[start, end]} onChange={setStart} /></div><div className="field">Through<DateField label="Through" value={end} min={start} max={dateValue(new Date())} range={[start, end]} onChange={setEnd} /></div></div>;
}

function UsageScreen({statistics = false, ...props}: ScreenProps & {statistics?: boolean}) {
    const {state} = props;
    const today = dateValue(dayStart(new Date(), state.settings.day_start_hour));
    const [period, setPeriod] = useState(statistics ? "Week" : "Today");
    const [start, setStart] = useState(statistics && state.firstLogMs ? dateValue(dayStart(new Date(state.firstLogMs), state.settings.day_start_hour)) : today);
    const [end, setEnd] = useState(today);
    const [scope, setScope] = useState("apps");
    const browserOnly = scope === "browser", timers = scope === "timers";
    const [average, setAverage] = useState(statistics);
    const chartKey = statistics ? "mobile-stats-chart" : "mobile-usage-chart";
    const [chart, setChart] = useState(() => { const saved = localStorage.getItem(chartKey); return saved && ["Ranked", "Donut", "Bars", "Trend"].includes(saved) ? saved : state.settings.use_bar_usage_chart ? "Bars" : statistics ? "Donut" : "Ranked"; });
    const [showAll, setShowAll] = useState(false);
    const range = rangeFor(period, new Date(), state.settings.day_start_hour, start, end);
    const usage = useQuery({queryKey: ["mobile-data", "usage", range, browserOnly], queryFn: () => request("usage", {...range, browserOnly}), refetchInterval: 15000, enabled: !timers});
    const manualData = timers ? manualUsage([...(state.manualEntries ?? []), ...(state.timer ? [{...state.timer, end_time: Date.now() / 1000}] : [])], range.startMs, range.endMs, state.settings.day_start_hour) : null;
    const data = manualData ?? usage.data, pending = !timers && usage.isPending;
    const colorOf = (key: string, index: number) => timers ? state.projects.find(item => item.name === key)?.color ?? "#687287" : palette[index % palette.length];
    const days = rangeDayCount(range.startMs, range.endMs, state.settings.day_start_hour);
    const divisor = average ? days : 1;
    const slices = data?.apps.filter(app => timers || app.seconds >= state.settings.min_app_duration).map(app => ({...app, seconds: app.seconds / divisor})) ?? [];
    const total = (data?.total ?? 0) / divisor;
    const top = slices.slice(0, 5);
    const remainder = Math.max(0, total - top.reduce((sum, app) => sum + app.seconds, 0));
    const donut = [...top.map((app, index) => ({label: app.label, value: app.seconds, color: colorOf(app.packageName, index)})), ...(remainder > 0 ? [{label: "Other activity", value: remainder, color: "#687287"}] : [])];
    const formatDate = (date: Date) => date.toLocaleDateString([], {month: "short", day: "numeric"});
    const first = formatDate(new Date(range.startMs)), last = formatDate(dayStart(new Date(range.endMs - 1), state.settings.day_start_hour));
    const span = first === last ? first : `${first} – ${last}`;
    const boundary = dateAtHour(today, state.settings.day_start_hour).toLocaleTimeString([], {hour: "numeric"});
    const unit = timers ? "Timer time" : browserOnly ? "Browser time" : "App time";
    const noun = timers ? "categories" : browserOnly ? "sites" : "apps";
    return <>
        <section className="range-summary" aria-label={average ? `${unit} average per day` : unit}><div className="range-total-row"><Choice label="Usage period" value={period} onChange={value => { setPeriod(value); setShowAll(false); }} options={[["Today", "Today"], ["Week", "This week"], ["Month", "This month"], ["Custom", "Custom range"]]} />{statistics ? <Choice label="Total calculation" value={average ? "average" : "total"} onChange={value => setAverage(value === "average")} options={[["average", "Daily avg"], ["total", "Total"]]} /> : <span className="range-unit">{unit}</span>}<strong>{pending ? "Loading…" : duration(total)}</strong></div><small>{period === "Custom" ? "" : `${span} · `}Days start {boundary}</small>{period === "Custom" && <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />}</section>
        {!statistics && <TimerCard {...props} />}
        {!timers && usage.error && <p className="error" role="alert">Could not load activity. <button onClick={() => void usage.refetch()}>Retry</button></p>}
        <Card className="activity-breakdown"><div className="breakdown-controls"><Choice className="choice-title" label="Activity scope" value={scope} onChange={value => { setScope(value); setShowAll(false); }} options={[["apps", "Apps"], ["browser", "Websites"], ["timers", "Timer categories"]]} /><Choice className="choice-quiet" label="Display activity as" value={chart} onChange={value => { setChart(value); localStorage.setItem(chartKey, value); }} options={[["Ranked", "List"], ["Donut", "Donut"], ["Bars", "Bars"], ["Trend", "Daily trend"]]} /></div>
            {pending ? <Empty>Loading activity…</Empty> : total === 0 ? <Empty>{timers ? "No timers recorded in this range." : "No activity in this range."}</Empty> : chart === "Donut" ? <div className="chart-legend"><div className="donut"><DonutChart data={donut} colors={new Map()} totalDuration={total} periodLabel={average ? "the daily average" : "the selected range"} /><small className="donut-caption">{average ? "Daily average" : "Total for range"}</small></div><div>{donut.map(item => <div className="legend-row" key={item.label}><span className="dot" style={{background: item.color}}/><span>{item.label}<small>{duration(item.value)}{average ? " / day" : ""}</small></span></div>)}</div></div> : chart === "Ranked" ? null : <><small className="chart-unit">{chart === "Trend" ? "Minutes recorded each day" : average ? "Average per day" : "Total in selected range"}</small><UsageChart usage={{...data!, apps: data!.apps.map(app => ({...app, seconds: app.seconds / divisor}))}} trend={chart === "Trend"} average={average} /></>}
            {chart === "Ranked" && (showAll ? slices : top).map((app, index) => <div className="usage-row" key={`${app.packageName}:${app.label}`}><div className="row"><span className="app-label">{app.label}</span><span className="usage-value">{duration(app.seconds)}{average ? <small>/day</small> : null}<small>{total > 0 ? (app.seconds / total * 100).toFixed(1) : 0}%</small></span></div><div className="meter"><i style={{width: `${total ? app.seconds / total * 100 : 0}%`, background: colorOf(app.packageName, index)}} /></div></div>)}
            {chart === "Ranked" && !showAll && slices.length > 5 && <button className="wide" onClick={() => setShowAll(true)}>Show all {slices.length} {noun}</button>}
            {!timers && state.settings.min_app_duration > 0 && <small className="chart-unit">Apps under {duration(state.settings.min_app_duration)} are hidden; their time remains in the total.</small>}
        </Card>
    </>;
}

function UsageChart({usage, trend, average}: {usage: Usage; trend: boolean; average: boolean}) {
    const data = trend ? usage.days.map(day => ({label: day.date.slice(5), minutes: Math.round(day.seconds / 60)})) : usage.apps.slice(0, 8).map(app => ({label: app.label, minutes: Math.round(app.seconds / 60)}));
    const tooltip = <Tooltip cursor={{fill: "#ffffff10"}} contentStyle={{background: "#1c202a", border: "1px solid #444"}} formatter={value => [`${value} min`, trend ? "Recorded" : "Time"]} />;
    if (!trend) return <div className="bar-chart"><ResponsiveContainer width="100%" height={Math.max(160, data.length * 36 + 30)}><BarChart data={data} layout="vertical" margin={{left: 0, right: 64, bottom: 4}}><XAxis type="number" hide /><YAxis type="category" dataKey="label" width={96} interval={0} tick={{fill: "#d6dae3", fontSize: 12}} />{tooltip}<Bar dataKey="minutes" fill="#b18bff" radius={[0, 4, 4, 0]} barSize={20}><LabelList dataKey="minutes" position="right" fill="#d6dae3" fontSize={11} formatter={(value: unknown) => duration(Math.round(Number(value)) * 60)} /></Bar></BarChart></ResponsiveContainer></div>;
    return <div className="bar-chart"><ResponsiveContainer width="100%" height={240}><BarChart data={data}><XAxis dataKey="label" tick={{fill: "#a9b0bf", fontSize: 10}} /><YAxis width={34} tick={{fill: "#a9b0bf", fontSize: 10}} /><Tooltip contentStyle={{background: "#1c202a", border: "1px solid #444"}} /><Bar dataKey="minutes" fill="#b18bff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function DayPicker({day, setDay, hour}: {day: string; setDay: (value: string) => void; hour: number}) {
    const today = dateValue(dayStart(new Date(), hour));
    const shift = (amount: number) => { const date = dateAtHour(day, hour); date.setDate(date.getDate() + amount); setDay(dateValue(date)); };
    return <div className="day-picker"><button onClick={() => shift(-1)} aria-label="Previous day">‹</button><DateField label="Selected day" value={day} max={today} onChange={setDay} /><button disabled={day >= today} onClick={() => shift(1)} aria-label="Next day">›</button><button disabled={day === today} onClick={() => setDay(today)}>Today</button></div>;
}

function LogDetails({log, close, act, busy}: {log: MobileLog; close: () => void} & Pick<ScreenProps, "act" | "busy">) {
    const [confirm, setConfirm] = useState(false);
    return <Modal title={log.app_label || log.app_name} close={close}>
        <div className="log-duration">{duration(log.duration)}</div>
        <dl className="log-details log-summary">
            {log.app_name !== log.app_label && <div><dt>Activity</dt><dd>{log.app_name}</dd></div>}
            <div><dt>Time</dt><dd>{stamp(log.start_timestamp)} – {log.end_timestamp ? clockTime(log.end_timestamp) : "now"}</dd></div>
            <div><dt>Category</dt><dd>{log.category || "Uncategorized"}</dd></div>
        </dl>
        <details className="technical-details"><summary>Technical details</summary><dl className="log-details">{Object.entries(log).filter(([, value]) => value != null).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{typeof value === "number" && /timestamp|time_used|install_time|update_time/.test(key) ? new Date(value).toLocaleString() : String(value)}</dd></div>)}</dl></details>
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
    return <><DayPicker day={day} setDay={value => { setDay(value); setLimit(100); }} hour={hour} /><div className="row logs-meta"><p className="muted">{logs.data ? `${Math.min(logs.data.length, limit)}${logs.data.length > limit ? "+" : ""} entries · ` : ""}{start.toLocaleTimeString([], {hour: "numeric"})} – {start.toLocaleTimeString([], {hour: "numeric"})}</p><button className="icon-button" aria-label="Refresh logs" disabled={props.busy} onClick={() => void props.act(() => request("import"))}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg></button></div>
        {logs.error && <p role="alert">Could not load logs. <button onClick={() => void logs.refetch()}>Retry</button></p>}
        {logs.isPending ? <Empty>Loading activity…</Empty> : !logs.data?.length ? <Empty>No activity recorded for this day.</Empty> : <div className="log-list">{logs.data.slice(0, limit).map(log => <button key={log.id} className="log-row" onClick={() => setSelected(log)}><span className="dot" style={{background: colorFor(log.package_name)}} /><span className="app-label"><strong>{log.app_name}</strong><small>{log.app_label && log.app_label !== log.app_name ? `${log.app_label} · ` : ""}{new Date(log.start_timestamp).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}{log.end_timestamp ? ` - ${new Date(log.end_timestamp).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}` : " - In progress"}</small></span><span>{duration(clipLog(log, +start, +end).duration)}</span></button>)}</div>}
        {(logs.data?.length ?? 0) > limit && <button onClick={() => setLimit(limit + 100)}>Show more logs</button>}
        {selected && <LogDetails log={selected} close={() => setSelected(null)} {...props} />}
    </>;
}

function CalendarScreen(props: ScreenProps) {
    const hour = props.state.settings.day_start_hour;
    const [day, setDay] = useState(dateValue(dayStart(new Date(), hour)));
    const [view, setView] = useState(() => localStorage.getItem("mobile-calendar-view") === "Timeline" ? "Timeline" : "Agenda");
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
        ...blocks.map(block => ({id: block.id, name: block.title, info: `App · ${duration(block.activeSeconds)}`, title: `${block.title} · ${duration(block.activeSeconds)}`, start: new Date(block.start), end: new Date(block.end), backgroundColor: colorFor(block.packageName), borderColor: "transparent", textColor: "#111318", extendedProps: {logs: block.logs}})),
        ...manualBlocks.map(entry => ({id: `manual-${entry.session_id}`, name: entry.title || "Untitled session", info: `${entry.running ? "Running · " : ""}${entry.project_name || "Uncategorized"} · ${duration((Math.min(+end, entry.end_time * 1000) - Math.max(+start, entry.start_time * 1000)) / 1000)}`, title: `${entry.running ? "● " : ""}${entry.title || "Untitled session"}${entry.project_name ? ` · ${entry.project_name}` : ""} · ${duration((Math.min(+end, entry.end_time * 1000) - Math.max(+start, entry.start_time * 1000)) / 1000)}`, start: new Date(Math.max(+start, entry.start_time * 1000)), end: new Date(Math.min(+end, entry.end_time * 1000)), backgroundColor: manualColor(entry.project_name), borderColor: "#f2f3f7", textColor: "#111318", classNames: ["manual-event"], extendedProps: {manual: entry}})),
    ];
    const clock = (date: Date) => date.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
    const appTotal = blocks.reduce((sum, block) => sum + block.activeSeconds, 0);
    const manualTotal = manualBlocks.reduce((sum, entry) => sum + (Math.min(+end, entry.end_time * 1000) - Math.max(+start, entry.start_time * 1000)) / 1000, 0);
    const openEvent = (event: typeof events[number]) => { if ("manual" in event.extendedProps) setManual(event.extendedProps.manual); else setSelected(event.extendedProps.logs); };
    return <><DayPicker day={day} setDay={setDay} hour={hour} /><div className="calendar-controls"><div className="segments" aria-label="Calendar view">{["Agenda", "Timeline"].map(item => <button key={item} aria-pressed={view === item} onClick={() => { setView(item); localStorage.setItem("mobile-calendar-view", item); }}>{item}</button>)}</div>{!logs.isPending && <small className="day-total">Apps {duration(appTotal)} · Timers {duration(manualTotal)}</small>}</div>
        {logs.error && <p role="alert">Could not load calendar. <button onClick={() => void logs.refetch()}>Retry</button></p>}
        {logs.isPending ? <Empty>Loading calendar…</Empty> : view === "Agenda" ? <div className="agenda-list">{[...events].sort((a, b) => +a.start - +b.start).map(event => <button className="agenda-event" key={event.id} style={{borderLeftColor: event.backgroundColor}} onClick={() => openEvent(event)}><span className="agenda-clock"><time>{clock(event.start)}{dateValue(event.start) !== day ? " +1d" : ""}</time><time>{clock(event.end)}{dateValue(event.end) !== day ? " +1d" : ""}</time></span><span className="agenda-description"><strong>{event.name}</strong><small>{event.info}</small></span><span aria-hidden="true">›</span></button>)}</div> : <><div className="day-overview" aria-hidden="true">{([["App", events.filter(event => !("manual" in event.extendedProps))], ["Manual", events.filter(event => "manual" in event.extendedProps)]] as const).map(([lane, items]) => <div className="day-lane" key={lane}><span>{lane}</span><span className="day-track">{items.map(event => <i key={event.id} style={{left: `${(+event.start - +start) / (+end - +start) * 100}%`, width: `max(2px, ${(+event.end - +event.start) / (+end - +start) * 100}%)`, background: event.backgroundColor}}/>)}</span></div>)}<div className="day-ticks">{[0, 6, 12, 18, 24].map(offset => <small key={offset} style={{left: `${offset / 24 * 100}%`}}>{new Date(+start + offset * 3600000).toLocaleTimeString([], {hour: "numeric"}).replace(/\s/g, "").toLowerCase()}</small>)}</div></div><div className="day-map">{[...events].sort((a, b) => +a.start - +b.start).map(event => <button className="day-map-event" key={event.id} onClick={() => openEvent(event)}><span className="row"><strong>{event.name}</strong><span aria-hidden="true">›</span></span><small>{clock(event.start)}{dateValue(event.start) !== day ? " +1d" : ""} – {clock(event.end)}{dateValue(event.end) !== day ? " +1d" : ""} · {event.info}</small><span className="day-track" aria-hidden="true"><i style={{left: `${(+event.start - +start) / (+end - +start) * 100}%`, width: `max(3px, ${(+event.end - +event.start) / (+end - +start) * 100}%)`, background: event.backgroundColor}}/></span></button>)}</div></>}


        {!logs.isPending && !events.length && <p className="muted">No time blocks match the detection settings for this day.</p>}
        {manual && <Modal title={manual.title || "Untitled session"} close={() => setManual(null)}><div className="log-duration">{duration(manual.end_time - manual.start_time)}</div><dl className="log-details log-summary">
            {([["Time", `${stamp(manual.start_time * 1000)} – ${manual.running ? "now" : clockTime(manual.end_time * 1000)}`], ["Category", manual.project_name || "Uncategorized"], ["Status", manual.running ? "Running" : manual.synced ? "Synced" : "Saved on phone · Waiting to sync"]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl></Modal>}
        {selected && !detail && <Modal title={`${selected[0]?.app_name ?? "App"} · ${selected.length} ${selected.length === 1 ? "session" : "sessions"}`} close={() => setSelected(null)}><div className="log-duration">{duration(selected.reduce((sum, log) => sum + log.duration, 0))}</div><div className="log-list">{selected.map(log => <button className="log-row" key={log.id} onClick={() => setDetail(log)}><span className="app-label"><strong>{log.app_label || log.app_name}</strong><small>{clockTime(log.start_timestamp)}{log.end_timestamp ? ` – ${clockTime(log.end_timestamp)}` : ""}</small></span><span>{duration(log.duration)}</span><span aria-hidden="true">›</span></button>)}</div></Modal>}
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
        <Card><div className="row"><h2>Sync server</h2><span className="status">{state.sync.server ? "Configured" : "Not connected"}</span></div>{!state.sync.server && <p>Use the address of your Time Tracker server. This phone keeps recording locally without a connection.</p>}{!state.sync.server ? <form onSubmit={event => { event.preventDefault(); void act(() => request("sync.check", {server}), "Server connected"); }}><label>Server address<input required aria-label="Server address" autoCapitalize="none" autoCorrect="off" placeholder="e.g. 192.168.1.10" aria-describedby="server-address-help" value={server} onChange={event => setServer(event.target.value)} /></label><small id="server-address-help">Find the address on the computer running your server. Keep both devices on the same network or VPN.</small><button className="primary wide" disabled={busy}>Connect</button></form> : <><div className="row"><code>{state.sync.server}</code><button disabled={busy} onClick={() => setConfirm("change")}>Change server</button></div><p>Upload this phone’s logs and sync shared notes and timers.</p>{state.sync.active && <div className="row"><span>Next sync: {state.sync.nextSyncSeconds == null ? "Scheduled" : duration(state.sync.nextSyncSeconds)}</span><button className="primary" disabled={busy} onClick={() => void act(() => request("sync.now"), "Sync complete")}>Sync now</button></div>}</>}</Card>
        {state.sync.server && <Card><div className="row"><h2>This device</h2><span className="status">{state.sync.active ? "Active" : state.sync.registered ? "Waiting for approval" : "Unregistered"}</span></div>{!state.sync.registered ? <><label>Device name<input value={name} onChange={event => setName(event.target.value)} /></label><button className="primary" disabled={busy || !name.trim()} onClick={() => setConfirm("register")}>Register this device</button></> : <><p className="uuid">{state.sync.uuid}</p>{!state.sync.active ? <button disabled={busy} onClick={() => void act(() => request("sync.approval"), "Approval checked")}>Check approval</button> : <button disabled={busy} onClick={() => setConfirm("reupload")}>Reupload all logs…</button>}</>}</Card>}
        {state.sync.active && <Card><div className="row"><h2>Other devices</h2><button onClick={() => void devices.refetch()}>Refresh</button></div><p>Device subscriptions are unavailable on mobile.</p>{devices.error ? <p role="alert">Could not load devices.</p> : devices.isPending ? <Empty>Loading devices…</Empty> : devices.data?.filter(device => device.uuid !== state.sync.uuid).map(device => <div className="device" key={device.uuid}><strong>{device.name}</strong><small>{device.uuid}</small></div>)}{devices.data?.filter(device => device.uuid !== state.sync.uuid).length === 0 && <Empty>No other devices.</Empty>}</Card>}
        {confirm && <Modal title={confirm === "register" ? "Register this device?" : confirm === "change" ? "Change sync server?" : "Reupload all logs?"} close={() => setConfirm(null)}><p>{confirm === "register" ? "Registering enables this phone to upload its logs after server approval." : confirm === "change" ? "This disconnects the current registration. Your local logs and notes remain saved." : "Send all local logs to your configured server again."}</p><div className="actions"><button disabled={busy} onClick={() => void act(action, "Done").then(ok => { if (ok) setConfirm(null); })}>Continue</button><button onClick={() => setConfirm(null)}>Cancel</button></div></Modal>}
    </>;
}

function SettingsScreen(props: ScreenProps) {
    const {state, act, busy} = props;
    const [settings, setSettings] = useState(state.settings);
    const apply = (change: Partial<Settings>) => { setSettings({...settings, ...change}); void act(() => request("settings.save", {...state.settings, ...change}), "Saved"); };
    const [skipped, setSkipped] = useState(false);
    const fields: [keyof Settings, string][] = [["day_start_hour", "Day starts at hour (0–23)"], ["min_app_duration", "Minimum app duration (seconds)"], ["min_log_duration", "Minimum log duration (seconds)"], ["max_attach_distance", "Maximum attach distance (seconds)"], ["lookahead_window", "Lookahead window (seconds)"], ["min_timeblock_duration", "Minimum time block (seconds)"]];
    const missingPermissions = (["usage", "browser", "media"] as const).filter(kind => !state.permissions[kind]);
    return <>{missingPermissions.length > 0 && <Card><h2>Tracking access</h2>{missingPermissions.map(kind => <div className="permission row" key={kind}><div><strong>{kind === "usage" ? "App usage" : kind === "browser" ? "Browser activity" : "Media playback"}</strong><small>{kind === "usage" ? "Required · Records which apps you use and for how long" : kind === "browser" ? "Optional · Adds page titles from supported browsers" : "Optional · Adds what is playing, such as videos and music"}</small></div><button disabled={busy} onClick={() => void act(() => request("permission", {kind}))}>Enable</button></div>)}</Card>}
        <Card className="preferences"><h2>Preferences</h2><form onSubmit={event => { event.preventDefault(); void act(() => request("settings.save", settings), "Settings saved"); }}><label className="check"><span>Show Notes<small>Saved notes are kept when hidden</small></span><input type="checkbox" role="switch" aria-checked={settings.notes_enabled} checked={settings.notes_enabled} onChange={event => apply({notes_enabled: event.target.checked})} /></label><label className="check"><span>Start charts as bars<small>Applies until you pick another chart</small></span><input type="checkbox" role="switch" aria-checked={settings.use_bar_usage_chart} checked={settings.use_bar_usage_chart} onChange={event => apply({use_bar_usage_chart: event.target.checked})} /></label><div className="setting-row"><span>Tracking day starts<small>Earlier activity belongs to the previous day</small></span><Choice label="Tracking day starts" value={String(settings.day_start_hour)} onChange={value => apply({day_start_hour: Number(value)})} options={Array.from({length: 24}, (_, hour) => [String(hour), dateAtHour("2026-01-01", hour).toLocaleTimeString([], {hour: "numeric"})] as [string, string])} /></div><details className="advanced-settings"><summary>Activity detection settings</summary><p className="muted">Adjust how short sessions and gaps form time blocks.</p>{fields.filter(([key]) => key !== "day_start_hour").map(([key, label]) => <label key={key}>{label}<input type="number" min={0} max={86400} required value={String(settings[key])} onChange={event => setSettings({...settings, [key]: event.target.value === "" ? "" : Number(event.target.value)})} /></label>)}<button className="primary wide" disabled={busy}>Save detection settings</button></details></form></Card>
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
