/**
 * The calendar's left "Sources" sidebar, in whichever candidate design is selected.
 *
 * Two families made the cut: colour checks (1, with 1a and 1b) and the minimal list
 * (2, with 2a-2f). All render from the same `SidebarSection` model, so they
 * drive the same toggles. As with Bramble's layout pickers, a dev build shows a picker
 * and the choice persists in localStorage; a packaged build always gets
 * `DEFAULT_LEFT_SIDEBAR_UI`. Once one wins, the others and this switch should go.
 */

import {useState, type ReactNode} from "react";

export type LeftSidebarUi = "1" | "1a" | "1b" | "2" | "2a" | "2b" | "2c" | "2d" | "2e" | "2f";

export const LEFT_SIDEBAR_UIS: readonly { id: LeftSidebarUi; hint: string }[] = [
    {id: "1", hint: "Colour checks, tinted: visible rows are washed in their colour with a colour edge"},
    {id: "1a", hint: "Colour checks: checks fill with the source colour, click a row for week, sticky section headers"},
    {id: "1b", hint: "Colour checks, power tools: search, an Everything row, and a Hidden / Differs focus filter"},
    {id: "2", hint: "Minimal: names only, eye / stats / isolate controls appear on hover"},
    {id: "2a", hint: "Minimal legend: the dot hides, the name solos"},
    {id: "2b", hint: "Minimal, tucked: hidden sources fold into a line per section, sections collapse to a dot strip"},
    {id: "2c", hint: "Minimal, words: \"week\" and \"stats\" toggles always shown, lit when on"},
    {id: "2d", hint: "Minimal, icon columns: eye and chart always shown under Week / Stats headings"},
    {id: "2e", hint: "Minimal, dot pair: two colour dots per row, round for week, square for stats"},
    {id: "2f", hint: "Minimal, whisper: rows note only what's unusual; hover for hide / +stats / only"},
];

export const DEFAULT_LEFT_SIDEBAR_UI: LeftSidebarUi = "1";
const KEY = "time-tracker:dev.left-sidebar-ui.v4";

/** The selected layout, persisted across reloads in a dev build only. */
export function useLeftSidebarUi(): [LeftSidebarUi, (ui: LeftSidebarUi) => void] {
    const [ui, setUi] = useState<LeftSidebarUi>(() => {
        if (!import.meta.env.DEV) return DEFAULT_LEFT_SIDEBAR_UI;
        const saved = localStorage.getItem(KEY);
        return LEFT_SIDEBAR_UIS.find((c) => c.id === saved)?.id ?? DEFAULT_LEFT_SIDEBAR_UI;
    });
    return [ui, (next) => {
        localStorage.setItem(KEY, next);
        setUi(next);
    }];
}

/** Dev-only switch between the layouts, pinned bottom-left; renders nothing in a packaged build. */
export function LeftSidebarPicker({ui, onChange}: { ui: LeftSidebarUi; onChange: (ui: LeftSidebarUi) => void }) {
    if (!import.meta.env.DEV) return null;
    return (
        <div className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-950/95 px-2 py-1 shadow-lg"
             title="Dev only: which left sidebar layout to show" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">sidebar</span>
            <div className="flex gap-0.5" role="radiogroup" aria-label="Left sidebar layout">
                {LEFT_SIDEBAR_UIS.map((c, i) => (
                    <button key={c.id} type="button" role="radio" aria-checked={ui === c.id} title={c.hint}
                            onClick={() => onChange(c.id)}
                            className={`h-6 min-w-6 rounded px-1 text-xs font-medium transition-colors ${i === 3 ? "ml-1.5" : ""} ${ui === c.id ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
                        {c.id}
                    </button>
                ))}
            </div>
        </div>
    );
}

export type SidebarToggleState = {
    inCal: boolean;
    inStats: boolean;
    onToggleCal: () => void;
    onToggleStats: () => void;
    disabled?: boolean;
};

export type SidebarSource = SidebarToggleState & {
    key: string;
    name: string;
    color: string;
    isolated?: boolean;
    onToggleIsolate?: () => void;
};

export type SidebarSection = {
    key: "categories" | "devices" | "manual" | "google";
    title: string;
    /** The section-wide toggles; absent for devices, which never had one. */
    all?: SidebarToggleState;
    items: SidebarSource[];
    emptyText?: string;
    error?: string;
};

type VariantProps = {
    sections: SidebarSection[];
    collapsed: boolean;
    onToggleCollapsed: () => void;
};

export default function LeftSideBar({ui, ...props}: VariantProps & { ui: LeftSidebarUi }) {
    return (
        // Clicks here must not reach the calendar's deselect handler.
        <div className="relative flex h-full shrink-0" onClick={(e) => e.stopPropagation()}>
            {props.collapsed ? <CollapsedRail {...props}/> : <Variant ui={ui} {...props}/>}
        </div>
    );
}

function Variant({ui, ...props}: VariantProps & { ui: LeftSidebarUi }) {
    switch (ui) {
        case "1": return <ColourList {...props} tinted/>;
        case "1a": return <ColourList {...props}/>;
        case "1b": return <ColourList {...props} tools/>;
        case "2": return <MinimalList {...props}/>;
        case "2a": return <LegendList {...props}/>;
        case "2b": return <TuckedList {...props}/>;
        case "2c": return <WordToggleList {...props}/>;
        case "2d": return <IconColumnsList {...props}/>;
        case "2e": return <DotPairList {...props}/>;
        case "2f": return <WhisperList {...props}/>;
    }
}

// ---------------------------------------------------------------- shared bits

const shell = "h-full border-r border-gray-800 bg-black overflow-y-auto overflow-x-hidden nice-scrollbar";

function IconWeekGrid({className}: { className?: string }) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect width="18" height="18" x="3" y="4" rx="2"/>
        <path d="M3 10h18"/>
        <path d="M9 4v18"/>
    </svg>;
}

function IconBarChart({className}: { className?: string }) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20V10"/>
        <path d="M18 20V4"/>
        <path d="M6 20v-4"/>
    </svg>;
}

function IconTarget({className}: { className?: string }) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="8"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>;
}

function IconCheck({className}: { className?: string }) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12l5 5L20 7"/>
    </svg>;
}

function IconChevron({open, className}: { open: boolean; className?: string }) {
    return <svg className={`${className ?? ""} transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 6l6 6-6 6"/>
    </svg>;
}

function IconEye({off, className}: { off?: boolean; className?: string }) {
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
        <circle cx="12" cy="12" r="3"/>
        {off && <path d="M3 3l18 18"/>}
    </svg>;
}

/** Bar chart, struck through when the source is left out of stats. */
function StatsGlyph({on, className}: { on: boolean; className?: string }) {
    return <span className="relative">
        <IconBarChart className={className}/>
        {!on && <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current"/>}
    </span>;
}

function SectionIcon({sectionKey, className}: { sectionKey: SidebarSection["key"]; className?: string }) {
    const paths: Record<SidebarSection["key"], ReactNode> = {
        categories: <><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></>,
        devices: <><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
        manual: <><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></>,
        google: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    };
    return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {paths[sectionKey]}
    </svg>;
}

function CollapseButton({collapsed, onClick}: { collapsed: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick}
                aria-label={collapsed ? "Expand filter sidebar" : "Collapse filter sidebar"}
                title={collapsed ? "Expand" : "Collapse"}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-800 hover:text-white">
            <IconChevron open={false} className={`h-3.5 w-3.5 ${collapsed ? "" : "rotate-180"}`}/>
        </button>
    );
}

function IsolateButton({source}: { source: SidebarSource }) {
    if (!source.onToggleIsolate) return <span className="h-6 w-6 shrink-0"/>;
    return (
        <button type="button" onClick={(e) => { e.stopPropagation(); source.onToggleIsolate?.(); }} disabled={source.disabled} aria-pressed={!!source.isolated}
                aria-label={source.isolated ? `Stop isolating ${source.name}` : `Isolate ${source.name} in week and stats`}
                title={source.isolated ? "Restore week and stats" : "Show only this source in week and stats"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all focus-visible:opacity-100 ${source.isolated
                    ? "bg-blue-600 text-white opacity-100"
                    : "text-gray-500 opacity-0 hover:bg-gray-800 hover:text-white group-hover:opacity-100"}`}>
            <IconTarget className="h-3.5 w-3.5"/>
        </button>
    );
}

function onCount(items: SidebarSource[]) {
    return items.filter((s) => s.inCal).length;
}

function Notes({section}: { section: SidebarSection }) {
    return <>
        {section.items.length === 0 && section.emptyText && <p className="px-2 py-1 text-xs text-gray-600">{section.emptyText}</p>}
        {section.error && <p className="px-2 py-1 text-xs text-red-400">{section.error}</p>}
    </>;
}

function useClosedSections() {
    const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
    const toggle = (key: string) => setClosed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
    return [closed, toggle] as const;
}

/** Collapsed form for every option: one swatch per source, click to toggle it in the week view. */
function CollapsedRail({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} flex w-14 flex-col items-center gap-3 py-3`}>
            <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed}/>
            {sections.map((section) => (
                <div key={section.key} className="flex flex-col items-center gap-1.5 border-t border-gray-800 pt-3" title={section.title}>
                    <SectionIcon sectionKey={section.key} className="mb-0.5 h-3.5 w-3.5 text-gray-600"/>
                    {section.items.map((source) => (
                        <button key={source.key} type="button" onClick={source.onToggleCal} disabled={source.disabled}
                                title={`${source.name}${source.inCal ? "" : " (hidden)"}`} aria-pressed={source.inCal}
                                className={`h-4 w-4 rounded-full transition-all hover:scale-125 ${source.isolated ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-black" : ""}`}
                                style={source.inCal ? {backgroundColor: source.color} : {boxShadow: `inset 0 0 0 1.5px ${source.color}`, opacity: 0.45}}/>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ================================================================ family 1: colour checks

function CheckCell({on, onClick, label, disabled, color}: {
    on: boolean; onClick: () => void; label: string; disabled?: boolean;
    /** Fill colour when on; slate otherwise. */
    color?: string;
}) {
    return (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className="flex h-6 w-6 shrink-0 items-center justify-center disabled:opacity-40">
            <span className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${on
                ? color ? "text-black/75 ring-1 ring-inset ring-black/20" : "bg-slate-400 text-black"
                : "border border-gray-700 text-transparent hover:border-gray-500"}`}
                  style={on && color ? {backgroundColor: color} : undefined}>
                <IconCheck className="h-3 w-3"/>
            </span>
        </button>
    );
}

function ColumnLegend() {
    return <>
        <span className="w-6"/>
        <span className="flex w-6 justify-center text-gray-500" title="Week view"><IconWeekGrid className="h-3.5 w-3.5"/></span>
        <span className="flex w-6 justify-center text-gray-500" title="Statistics"><IconBarChart className="h-3.5 w-3.5"/></span>
    </>;
}

const ALL_COLOR = "#94a3b8";

function AllCells({section}: { section: SidebarSection }) {
    const all = section.all;
    if (!all) return <span className="w-12"/>;
    return <>
        <CheckCell on={all.inCal} onClick={all.onToggleCal} disabled={all.disabled} color={ALL_COLOR} label={`All ${section.title} in week view`}/>
        <CheckCell on={all.inStats} onClick={all.onToggleStats} disabled={all.disabled} color={ALL_COLOR} label={`All ${section.title} in statistics`}/>
    </>;
}

/** Pinned while its section scrolls past. */
function ColourSectionHeader({section, open, onToggleOpen}: { section: SidebarSection; open: boolean; onToggleOpen: () => void }) {
    return (
        <div className="sticky top-0 z-10 border-y border-gray-900 bg-black/95 px-1 backdrop-blur">
            <div className="flex items-center gap-1 rounded-md py-0.5 pl-1 pr-1">
                <button type="button" onClick={onToggleOpen} aria-expanded={open}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-gray-400 hover:text-white">
                    <IconChevron open={open} className="h-3 w-3 shrink-0"/>
                    <span className="truncate text-[11px] font-semibold uppercase tracking-wider">{section.title}</span>
                    <span className="text-[11px] tabular-nums text-gray-600">{onCount(section.items)}/{section.items.length}</span>
                </button>
                <span className="w-6"/>
                <AllCells section={section}/>
            </div>
        </div>
    );
}

/** A source row: click anywhere to toggle the week view; checks fill with the source's colour. */
function ColourRow({source, tinted, differs}: {
    source: SidebarSource;
    /** 1: wash a visible row in its colour, with a colour edge. */
    tinted?: boolean;
    /** 1b: mark rows whose week and stats settings disagree. */
    differs?: boolean;
}) {
    const wash = tinted && source.inCal;
    return (
        <div role="button" tabIndex={source.disabled ? -1 : 0} aria-pressed={source.inCal}
             onClick={() => !source.disabled && source.onToggleCal()}
             onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !source.disabled) { e.preventDefault(); source.onToggleCal(); } }}
             title={source.inCal ? "Click to hide in week view" : "Click to show in week view"}
             className={`group relative flex cursor-pointer items-center gap-2 rounded-md py-0.5 pl-2 pr-1 transition-[background-color,filter] ${tinted ? "mb-0.5" : ""} ${source.isolated
                 ? tinted ? "ring-1 ring-inset ring-blue-400" : "bg-blue-500/10 shadow-[inset_2px_0_0_#3b82f6]"
                 : ""} ${wash ? "hover:brightness-125" : source.isolated ? "" : "hover:bg-white/[0.04]"} ${source.disabled ? "cursor-not-allowed opacity-50" : ""}`}
             style={wash ? {
                 backgroundColor: `color-mix(in srgb, ${source.color} 14%, transparent)`,
                 boxShadow: `inset 3px 0 0 ${source.color}`,
             } : undefined}>
            {differs && source.inCal !== source.inStats && (
                <span className="pointer-events-none absolute left-0.5 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-amber-400/70" title="Week and stats differ"/>
            )}
            <span className={`min-w-0 flex-1 truncate text-[13px] ${source.inCal ? "text-gray-100" : "text-gray-600"}`}>{source.name}</span>
            <IsolateButton source={source}/>
            <CheckCell on={source.inCal} onClick={source.onToggleCal} disabled={source.disabled} color={source.color} label={`Show ${source.name} in week view`}/>
            <CheckCell on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled} color={source.color} label={`Include ${source.name} in statistics`}/>
        </div>
    );
}

type Focus = "all" | "hidden" | "differs";
const FOCUSES: { id: Focus; label: string; hint: string }[] = [
    {id: "all", label: "All", hint: "Every source"},
    {id: "hidden", label: "Hidden", hint: "Sources off in the week view or stats"},
    {id: "differs", label: "Differs", hint: "Sources whose week and stats settings disagree"},
];

/** 1b's search box, focus filter and Everything row. */
function ColourTools({sections, query, setQuery, focus, setFocus}: {
    sections: SidebarSection[];
    query: string; setQuery: (q: string) => void;
    focus: Focus; setFocus: (f: Focus) => void;
}) {
    const everyItem = sections.flatMap((s) => s.items);
    const everythingCal = everyItem.length > 0 && everyItem.every((s) => s.inCal);
    const everythingStats = everyItem.length > 0 && everyItem.every((s) => s.inStats);
    // Flip each section to the shared target, using its own all-toggle where it has one.
    const flipEverything = (field: "cal" | "stats") => {
        const target = !(field === "cal" ? everythingCal : everythingStats);
        for (const section of sections) {
            if (section.all) {
                if (section.all.disabled) continue;
                const on = field === "cal" ? section.all.inCal : section.all.inStats;
                if (on !== target) (field === "cal" ? section.all.onToggleCal : section.all.onToggleStats)();
            } else {
                for (const s of section.items) {
                    if ((field === "cal" ? s.inCal : s.inStats) !== target) (field === "cal" ? s.onToggleCal : s.onToggleStats)();
                }
            }
        }
    };
    const filtering = query.trim() !== "" || focus !== "all";

    return (
        <div className="space-y-2 px-2 pb-2">
            <div className="relative">
                <svg className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="11" cy="11" r="7"/>
                    <path d="M21 21l-4.3-4.3"/>
                </svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter sources…"
                       onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
                       className="w-full rounded-md border border-gray-800 bg-gray-950 py-1 pl-7 pr-2 text-[13px] text-gray-200 placeholder:text-gray-600 focus:border-blue-500/60 focus:outline-none"/>
            </div>
            <div className="grid grid-cols-3 gap-0.5 rounded-md bg-gray-900 p-0.5" role="radiogroup" aria-label="Which sources to list">
                {FOCUSES.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={focus === f.id} title={f.hint} onClick={() => setFocus(f.id)}
                            className={`rounded py-0.5 text-[11px] font-medium transition-colors ${focus === f.id ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-200"}`}>
                        {f.label}
                    </button>
                ))}
            </div>
            {!filtering && (
                <div className="flex items-center gap-1 pl-1 pr-0">
                    <span className="flex-1 text-[12px] font-medium text-gray-300">Everything</span>
                    <span className="w-6"/>
                    <CheckCell on={everythingCal} onClick={() => flipEverything("cal")} color={ALL_COLOR} label="Every source in week view"/>
                    <CheckCell on={everythingStats} onClick={() => flipEverything("stats")} color={ALL_COLOR} label="Every source in statistics"/>
                </div>
            )}
        </div>
    );
}

/**
 * Family 1. Checks fill with each source's own colour, the whole row toggles the week
 * view, and section headers stay pinned while scrolling. 1 also washes visible rows in
 * their colour; 1b adds search, a focus filter and an Everything row.
 */
function ColourList({sections, collapsed, onToggleCollapsed, tinted = false, tools = false}: VariantProps & { tinted?: boolean; tools?: boolean }) {
    const [closed, toggleSection] = useClosedSections();
    const [query, setQuery] = useState("");
    const [focus, setFocus] = useState<Focus>("all");
    const q = tools ? query.trim().toLowerCase() : "";
    const filtering = q !== "" || (tools && focus !== "all");
    const matches = (s: SidebarSource) =>
        (!q || s.name.toLowerCase().includes(q)) &&
        (!tools || focus === "all" || (focus === "hidden" ? !s.inCal || !s.inStats : s.inCal !== s.inStats));
    const shown = filtering
        ? sections.map((section) => ({...section, items: section.items.filter(matches)})).filter((section) => section.items.length > 0)
        : sections;

    return (
        <div className={`${shell} w-64`}>
            <div className="flex items-center gap-1 py-2 pl-2 pr-1">
                <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed}/>
                <span className="flex-1 text-sm font-semibold text-white">Sources</span>
                <ColumnLegend/>
            </div>
            {tools && <ColourTools sections={sections} query={query} setQuery={setQuery} focus={focus} setFocus={setFocus}/>}
            <div className="pb-3">
                {shown.length === 0 && (
                    <p className="px-2 py-4 text-center text-[13px] text-gray-500">
                        {q ? `No sources match “${query}”` : focus === "hidden" ? "Nothing hidden" : "Week and stats agree everywhere"}
                    </p>
                )}
                {shown.map((section) => {
                    const open = filtering || !closed.has(section.key);
                    return (
                        <div key={section.key}>
                            <ColourSectionHeader section={section} open={open} onToggleOpen={() => toggleSection(section.key)}/>
                            {open && <div className="px-1 py-1">
                                {section.items.map((source) => <ColourRow key={source.key} source={source} tinted={tinted} differs={tools}/>)}
                                {!filtering && <Notes section={section}/>}
                            </div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ================================================================ family 2: minimal list

function HoverButton({on, onClick, label, disabled, children, sticky = false}: {
    on: boolean; onClick: () => void; label: string; disabled?: boolean; children: ReactNode;
    /** Stay visible outside hover (used to flag a non-default state). */
    sticky?: boolean;
}) {
    return (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all focus-visible:opacity-100 disabled:opacity-30 ${on ? "text-gray-300" : "text-gray-600"} hover:bg-gray-800 hover:text-white ${sticky ? "" : "opacity-0 group-hover:opacity-100"}`}>
            {children}
        </button>
    );
}

function MinimalHeader({title, collapsed, onToggleCollapsed}: { title: string; collapsed: boolean; onToggleCollapsed: () => void }) {
    return (
        <div className="mb-3 flex items-center justify-between pl-2">
            <span className="text-xs font-medium text-gray-500">{title}</span>
            <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed}/>
        </div>
    );
}

function MinimalSectionAll({section}: { section: SidebarSection }) {
    if (!section.all) return null;
    const all = section.all;
    return <>
        <HoverButton on={all.inCal} onClick={all.onToggleCal} disabled={all.disabled}
                     label={all.inCal ? `Hide all ${section.title}` : `Show all ${section.title}`}>
            <IconEye off={!all.inCal} className="h-3.5 w-3.5"/>
        </HoverButton>
        <HoverButton on={all.inStats} onClick={all.onToggleStats} disabled={all.disabled}
                     label={all.inStats ? `Exclude all ${section.title} from stats` : `Include all ${section.title} in stats`}>
            <IconBarChart className="h-3.5 w-3.5"/>
        </HoverButton>
    </>;
}

function MinimalRow({source}: { source: SidebarSource }) {
    return (
        <div className="group flex h-7 items-center gap-2 rounded-md pl-2 hover:bg-white/[0.04]">
            <button type="button" onClick={source.onToggleCal} disabled={source.disabled}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    title={source.inCal ? "Hide in week view" : "Show in week view"}>
                <span className="h-2 w-2 shrink-0 rounded-full transition-opacity"
                      style={{backgroundColor: source.color, opacity: source.inCal ? 1 : 0.25}}/>
                <span className={`truncate text-[13px] transition-colors ${source.inCal ? "text-gray-200" : "text-gray-600"}`}>{source.name}</span>
            </button>
            <HoverButton on={source.inCal} onClick={source.onToggleCal} disabled={source.disabled}
                         label={source.inCal ? "Hide in week view" : "Show in week view"}>
                <IconEye off={!source.inCal} className="h-3.5 w-3.5"/>
            </HoverButton>
            {/* Excluded from stats is the unusual state, so it stays flagged when not hovered. */}
            <HoverButton on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled} sticky={!source.inStats}
                         label={source.inStats ? "Exclude from statistics" : "Include in statistics"}>
                <StatsGlyph on={source.inStats} className="h-3.5 w-3.5"/>
            </HoverButton>
            <IsolateButton source={source}/>
        </div>
    );
}

/** 2: the original pick. */
function MinimalList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} w-60 px-2 py-3`}>
            <MinimalHeader title="Sources" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed}/>
            <div className="space-y-4">
                {sections.map((section) => (
                    <div key={section.key}>
                        <div className="group flex h-7 items-center gap-1 pl-2">
                            <span className="flex-1 text-xs font-medium text-gray-500">{section.title}</span>
                            <MinimalSectionAll section={section}/>
                            <span className="w-6"/>
                        </div>
                        {section.items.map((source) => <MinimalRow key={source.key} source={source}/>)}
                        <Notes section={section}/>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * 2a: reads like a chart legend. The dot shows or hides a source in the week view;
 * clicking the name solos it (isolates it in week and stats), clicking again restores.
 */
function LegendList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    const soloing = sections.some((s) => s.items.some((i) => i.isolated));
    return (
        <div className={`${shell} w-60 px-2 py-3`}>
            <MinimalHeader title="Sources" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed}/>
            <p className="-mt-1 mb-3 pl-2 text-[11px] text-gray-600">Dot hides · name solos</p>
            <div className="space-y-4">
                {sections.map((section) => (
                    <div key={section.key}>
                        <div className="group flex h-7 items-center gap-1 pl-2">
                            <span className="flex-1 text-xs font-medium text-gray-500">{section.title}</span>
                            <MinimalSectionAll section={section}/>
                        </div>
                        {section.items.map((source) => {
                            const solo = source.onToggleIsolate ?? source.onToggleCal;
                            return (
                                <div key={source.key} className="group flex h-7 items-center gap-1 rounded-md hover:bg-white/[0.04]">
                                    <button type="button" onClick={source.onToggleCal} disabled={source.disabled} aria-pressed={source.inCal}
                                            aria-label={source.inCal ? `Hide ${source.name} in week view` : `Show ${source.name} in week view`}
                                            title={source.inCal ? "Hide in week view" : "Show in week view"}
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-white/[0.06]">
                                        <span className="h-2.5 w-2.5 rounded-full transition-all"
                                              style={source.inCal ? {backgroundColor: source.color} : {boxShadow: `inset 0 0 0 1.5px ${source.color}`, opacity: 0.6}}/>
                                    </button>
                                    <button type="button" onClick={solo} disabled={source.disabled} aria-pressed={!!source.isolated}
                                            title={source.onToggleIsolate ? (source.isolated ? "Restore week and stats" : "Show only this") : undefined}
                                            className={`min-w-0 flex-1 truncate text-left text-[13px] transition-colors ${source.isolated
                                                ? "font-medium text-blue-300"
                                                : soloing ? "text-gray-600 hover:text-gray-300"
                                                    : source.inCal ? "text-gray-200 hover:text-white" : "text-gray-600 hover:text-gray-300"}`}>
                                        {source.name}
                                    </button>
                                    {source.isolated && <span className="shrink-0 rounded bg-blue-600/20 px-1 text-[10px] font-semibold uppercase tracking-wide text-blue-300">solo</span>}
                                    <HoverButton on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled} sticky={!source.inStats}
                                                 label={source.inStats ? "Exclude from statistics" : "Include in statistics"}>
                                        <StatsGlyph on={source.inStats} className="h-3.5 w-3.5"/>
                                    </HoverButton>
                                </div>
                            );
                        })}
                        <Notes section={section}/>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * 2b: the minimal list with clutter put away. Sources hidden from the week view fold
 * into an "n hidden" line at the end of their section, and a section title folds the
 * whole section down to a strip of its colours.
 */
function TuckedList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    const [closed, toggleSection] = useClosedSections();
    const [openHidden, toggleHidden] = useClosedSections();
    return (
        <div className={`${shell} w-60 px-2 py-3`}>
            <MinimalHeader title="Sources" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed}/>
            <div className="space-y-3">
                {sections.map((section) => {
                    const open = !closed.has(section.key);
                    const shown = section.items.filter((s) => s.inCal);
                    const hidden = section.items.filter((s) => !s.inCal);
                    const hiddenOpen = openHidden.has(section.key);
                    return (
                        <div key={section.key}>
                            <div className="group flex h-7 items-center gap-1 pl-2">
                                <button type="button" onClick={() => toggleSection(section.key)} aria-expanded={open}
                                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-gray-500 hover:text-gray-200">
                                    <span className="truncate">{section.title}</span>
                                    <IconChevron open={open} className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100"/>
                                </button>
                                {open && <MinimalSectionAll section={section}/>}
                                <span className="w-6"/>
                            </div>
                            {!open ? (
                                <button type="button" onClick={() => toggleSection(section.key)} title={`Expand ${section.title}`}
                                        className="flex w-full flex-wrap gap-1 rounded-md px-2 py-1 hover:bg-white/[0.04]">
                                    {section.items.length === 0 && <span className="text-[11px] text-gray-700">empty</span>}
                                    {section.items.map((s) => (
                                        <span key={s.key} className="h-2 w-2 rounded-full"
                                              style={{backgroundColor: s.color, opacity: s.inCal ? 1 : 0.2}}/>
                                    ))}
                                </button>
                            ) : <>
                                {shown.map((source) => <MinimalRow key={source.key} source={source}/>)}
                                {hidden.length > 0 && <>
                                    <button type="button" onClick={() => toggleHidden(section.key)} aria-expanded={hiddenOpen}
                                            className="flex h-7 w-full items-center gap-2 rounded-md pl-2 text-left text-[12px] text-gray-600 hover:bg-white/[0.04] hover:text-gray-300">
                                        <span className="flex -space-x-1">
                                            {hidden.slice(0, 4).map((s) => (
                                                <span key={s.key} className="h-2 w-2 rounded-full ring-1 ring-black" style={{backgroundColor: s.color, opacity: 0.4}}/>
                                            ))}
                                        </span>
                                        <span className="flex-1">{hidden.length} hidden</span>
                                        <IconChevron open={hiddenOpen} className="mr-2 h-2.5 w-2.5"/>
                                    </button>
                                    {hiddenOpen && <div className="ml-2 border-l border-gray-800 pl-1">
                                        {hidden.map((source) => <MinimalRow key={source.key} source={source}/>)}
                                    </div>}
                                </>}
                                <Notes section={section}/>
                            </>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- family 2, always-visible takes
// 2c-2f keep 2's quiet look, but every control is on screen without hovering, apart from
// isolate (and 2f's word buttons), so nothing has to be discovered.

/** A titled section: muted title, its all-controls on the right, then its rows. */
function PlainSection({section, controls, children}: { section: SidebarSection; controls?: ReactNode; children: ReactNode }) {
    return (
        <div>
            <div className="flex h-7 items-center gap-1 pl-2">
                <span className="flex-1 truncate text-xs font-medium text-gray-500">{section.title}</span>
                {controls}
            </div>
            {children}
            <Notes section={section}/>
        </div>
    );
}

function Swatch({source}: { source: SidebarSource }) {
    return <span className="h-2 w-2 shrink-0 rounded-full transition-opacity"
                 style={{backgroundColor: source.color, opacity: source.inCal ? 1 : 0.25}}/>;
}

function SourceName({source}: { source: SidebarSource }) {
    return <span className={`min-w-0 flex-1 truncate text-[13px] transition-colors ${source.isolated ? "text-blue-300" : source.inCal ? "text-gray-200" : "text-gray-600"}`}
                 title={source.name}>{source.name}</span>;
}

/** Column labels for the two always-visible controls, sitting over a trailing isolate slot. */
function MinimalColumns({first, second}: { first: ReactNode; second: ReactNode }) {
    return (
        <div className="mb-1 flex h-5 items-center gap-1 pl-2 text-gray-600">
            <span className="flex-1"/>
            <span className="flex w-6 justify-center">{first}</span>
            <span className="flex w-6 justify-center">{second}</span>
            <span className="w-6"/>
        </div>
    );
}

function WordToggle({on, onClick, children, label, disabled}: { on: boolean; onClick: () => void; children: ReactNode; label: string; disabled?: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none transition-colors disabled:opacity-30 ${on
                    ? "bg-white/[0.07] text-gray-200 hover:bg-white/[0.12]"
                    : "text-gray-600 hover:bg-white/[0.04] hover:text-gray-300"}`}>
            {children}
        </button>
    );
}

/** 2c: the toggles are the words "week" and "stats", lit when on. Nothing to decode. */
function WordToggleList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} w-64 px-2 py-3`}>
            <MinimalHeader title="Sources" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed}/>
            <div className="space-y-4">
                {sections.map((section) => (
                    <PlainSection key={section.key} section={section} controls={section.all && <>
                        <WordToggle on={section.all.inCal} onClick={section.all.onToggleCal} disabled={section.all.disabled} label={`All ${section.title} in week view`}>week</WordToggle>
                        <WordToggle on={section.all.inStats} onClick={section.all.onToggleStats} disabled={section.all.disabled} label={`All ${section.title} in statistics`}>stats</WordToggle>
                        <span className="w-6"/>
                    </>}>
                        {section.items.map((source) => (
                            <div key={source.key} className="group flex h-7 items-center gap-1 rounded-md pl-2 hover:bg-white/[0.03]">
                                <span className="flex min-w-0 flex-1 items-center gap-2.5"><Swatch source={source}/><SourceName source={source}/></span>
                                <WordToggle on={source.inCal} onClick={source.onToggleCal} disabled={source.disabled} label={`Show ${source.name} in week view`}>week</WordToggle>
                                <WordToggle on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled} label={`Include ${source.name} in statistics`}>stats</WordToggle>
                                <IsolateButton source={source}/>
                            </div>
                        ))}
                    </PlainSection>
                ))}
            </div>
        </div>
    );
}

function GlyphToggle({on, onClick, label, disabled, children}: { on: boolean; onClick: () => void; label: string; disabled?: boolean; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-30 hover:bg-gray-800 hover:text-white ${on ? "text-gray-300" : "text-gray-700"}`}>
            {children}
        </button>
    );
}

/** 2d: 2's eye and chart icons, always shown in labelled columns; off reads as struck and dark. */
function IconColumnsList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} w-60 px-2 py-3`}>
            <MinimalHeader title="Sources" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed}/>
            <MinimalColumns first={<span className="text-[10px]">Week</span>} second={<span className="text-[10px]">Stats</span>}/>
            <div className="space-y-4">
                {sections.map((section) => (
                    <PlainSection key={section.key} section={section} controls={section.all && <>
                        <GlyphToggle on={section.all.inCal} onClick={section.all.onToggleCal} disabled={section.all.disabled} label={`All ${section.title} in week view`}>
                            <IconEye off={!section.all.inCal} className="h-3.5 w-3.5"/>
                        </GlyphToggle>
                        <GlyphToggle on={section.all.inStats} onClick={section.all.onToggleStats} disabled={section.all.disabled} label={`All ${section.title} in statistics`}>
                            <StatsGlyph on={section.all.inStats} className="h-3.5 w-3.5"/>
                        </GlyphToggle>
                        <span className="w-6"/>
                    </>}>
                        {section.items.map((source) => (
                            <div key={source.key} className="group flex h-7 items-center gap-1 rounded-md pl-2 hover:bg-white/[0.03]">
                                <span className="flex min-w-0 flex-1 items-center gap-2.5"><Swatch source={source}/><SourceName source={source}/></span>
                                <GlyphToggle on={source.inCal} onClick={source.onToggleCal} disabled={source.disabled} label={source.inCal ? "Hide in week view" : "Show in week view"}>
                                    <IconEye off={!source.inCal} className="h-3.5 w-3.5"/>
                                </GlyphToggle>
                                <GlyphToggle on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled} label={source.inStats ? "Exclude from statistics" : "Include in statistics"}>
                                    <StatsGlyph on={source.inStats} className="h-3.5 w-3.5"/>
                                </GlyphToggle>
                                <IsolateButton source={source}/>
                            </div>
                        ))}
                    </PlainSection>
                ))}
            </div>
        </div>
    );
}

function Dot({on, color, shape, onClick, label, disabled}: {
    on: boolean; color: string; shape: "round" | "square"; onClick: () => void; label: string; disabled?: boolean;
}) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-white/[0.06] disabled:opacity-30">
            <span className={`h-2.5 w-2.5 transition-all ${shape === "round" ? "rounded-full" : "rounded-[2px]"}`}
                  style={on ? {backgroundColor: color} : {boxShadow: `inset 0 0 0 1.5px ${color}`, opacity: 0.5}}/>
        </button>
    );
}

/** 2e: no icons or words per row, just two of the source's colour dots: round for week, square for stats. */
function DotPairList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} w-60 px-2 py-3`}>
            <MinimalHeader title="Sources" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed}/>
            <MinimalColumns
                first={<span title="Week view (round)"><IconWeekGrid className="h-3 w-3"/></span>}
                second={<span title="Statistics (square)"><IconBarChart className="h-3 w-3"/></span>}/>
            <div className="space-y-4">
                {sections.map((section) => (
                    <PlainSection key={section.key} section={section} controls={section.all && <>
                        <Dot on={section.all.inCal} color="#9ca3af" shape="round" onClick={section.all.onToggleCal} disabled={section.all.disabled} label={`All ${section.title} in week view`}/>
                        <Dot on={section.all.inStats} color="#9ca3af" shape="square" onClick={section.all.onToggleStats} disabled={section.all.disabled} label={`All ${section.title} in statistics`}/>
                        <span className="w-6"/>
                    </>}>
                        {section.items.map((source) => (
                            <div key={source.key} className="group flex h-7 items-center gap-1 rounded-md pl-2 hover:bg-white/[0.03]">
                                <SourceName source={source}/>
                                <Dot on={source.inCal} color={source.color} shape="round" onClick={source.onToggleCal} disabled={source.disabled}
                                     label={source.inCal ? `Hide ${source.name} in week view` : `Show ${source.name} in week view`}/>
                                <Dot on={source.inStats} color={source.color} shape="square" onClick={source.onToggleStats} disabled={source.disabled}
                                     label={source.inStats ? `Exclude ${source.name} from statistics` : `Include ${source.name} in statistics`}/>
                                <IsolateButton source={source}/>
                            </div>
                        ))}
                    </PlainSection>
                ))}
            </div>
        </div>
    );
}

function HoverWord({onClick, children, label, disabled, accent}: { onClick: () => void; children: ReactNode; label: string; disabled?: boolean; accent?: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
                className={`shrink-0 rounded px-1 py-0.5 text-[11px] leading-none transition-colors disabled:opacity-30 ${accent ? "text-blue-300 hover:bg-blue-500/15" : "text-gray-400 hover:bg-white/[0.08] hover:text-white"}`}>
            {children}
        </button>
    );
}

/**
 * 2f: at rest a row says in plain words only what is unusual about it ("hidden",
 * "no stats", "only"); hovering swaps that for word buttons that change it.
 */
function WhisperList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} w-60 px-2 py-3`}>
            <MinimalHeader title="Sources" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed}/>
            <div className="space-y-4">
                {sections.map((section) => (
                    <PlainSection key={section.key} section={section} controls={section.all && <span className="flex gap-0.5 pr-1">
                        <HoverWord onClick={section.all.onToggleCal} disabled={section.all.disabled} label={`${section.all.inCal ? "Hide" : "Show"} all ${section.title}`}>
                            {section.all.inCal ? "hide all" : "show all"}
                        </HoverWord>
                    </span>}>
                        {section.items.map((source) => {
                            const notes = [
                                source.isolated && <span key="only" className="text-blue-300">only</span>,
                                !source.inCal && !source.isolated && <span key="hidden">hidden</span>,
                                !source.inStats && <span key="stats">no stats</span>,
                            ].filter(Boolean);
                            return (
                                <div key={source.key} className="group flex h-7 items-center gap-2 rounded-md pl-2 pr-1 hover:bg-white/[0.04]">
                                    <Swatch source={source}/>
                                    <SourceName source={source}/>
                                    <span className="flex shrink-0 gap-1.5 text-[11px] text-gray-600 group-hover:hidden">
                                        {notes.map((n, i) => <span key={i} className="flex gap-1.5">{i > 0 && <span className="text-gray-800">·</span>}{n}</span>)}
                                    </span>
                                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                                        <HoverWord onClick={source.onToggleCal} disabled={source.disabled} label={source.inCal ? "Hide in week view" : "Show in week view"}>
                                            {source.inCal ? "hide" : "show"}
                                        </HoverWord>
                                        <HoverWord onClick={source.onToggleStats} disabled={source.disabled} label={source.inStats ? "Exclude from statistics" : "Include in statistics"}>
                                            {source.inStats ? "−stats" : "+stats"}
                                        </HoverWord>
                                        {source.onToggleIsolate && (
                                            <HoverWord onClick={source.onToggleIsolate} disabled={source.disabled} accent
                                                       label={source.isolated ? "Restore week and stats" : "Show only this source"}>
                                                {source.isolated ? "restore" : "only"}
                                            </HoverWord>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </PlainSection>
                ))}
            </div>
        </div>
    );
}
