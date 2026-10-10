/**
 * The calendar's left "Sources" sidebar, in whichever candidate design is selected.
 *
 * Two designs remain: tinted colour checks (1) and the minimal list (2). Both render
 * from the same `SidebarSection` model, so they drive the same toggles. As with
 * Bramble's layout pickers, a dev build shows a picker and the choice persists in
 * localStorage; a packaged build always gets `DEFAULT_LEFT_SIDEBAR_UI`. Once one wins,
 * the other and this switch should go.
 */

import {useState, type ReactNode} from "react";

export type LeftSidebarUi = "1" | "2";

export const LEFT_SIDEBAR_UIS: readonly { id: LeftSidebarUi; hint: string }[] = [
    {id: "1", hint: "Colour checks: rows washed in their colour, checks fill with it, click a row for week"},
    {id: "2", hint: "Minimal: names only; state and eye / stats / isolate controls show on hover"},
];

export const DEFAULT_LEFT_SIDEBAR_UI: LeftSidebarUi = "1";
const KEY = "time-tracker:dev.left-sidebar-ui.v5";

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
                {LEFT_SIDEBAR_UIS.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={ui === c.id} title={c.hint}
                            onClick={() => onChange(c.id)}
                            className={`h-6 min-w-6 rounded px-1 text-xs font-medium transition-colors ${ui === c.id ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
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
            {props.collapsed ? <CollapsedRail {...props}/>
                : ui === "1" ? <ColourList {...props}/>
                    : <MinimalList {...props}/>}
        </div>
    );
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

function IsolateButton({source, quiet = false}: {
    source: SidebarSource;
    /** Hide even an active isolation until the row is hovered (option 2). */
    quiet?: boolean;
}) {
    if (!source.onToggleIsolate) return <span className="h-6 w-6 shrink-0"/>;
    return (
        <button type="button" onClick={(e) => { e.stopPropagation(); source.onToggleIsolate?.(); }} disabled={source.disabled} aria-pressed={!!source.isolated}
                aria-label={source.isolated ? `Stop isolating ${source.name}` : `Isolate ${source.name} in week and stats`}
                title={source.isolated ? "Restore week and stats" : "Show only this source in week and stats"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all focus-visible:opacity-100 ${source.isolated
                    ? `bg-blue-600 text-white ${quiet ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`
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

/** Collapsed form for both options: one swatch per source, click to toggle it in the week view. */
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

// ================================================================ option 1: colour checks

function CheckCell({on, onClick, label, disabled, color}: {
    on: boolean; onClick: () => void; label: string; disabled?: boolean; color: string;
}) {
    return (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className="flex h-6 w-6 shrink-0 items-center justify-center disabled:opacity-40">
            <span className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${on
                ? "text-black/75 ring-1 ring-inset ring-black/20"
                : "border border-gray-700 text-transparent hover:border-gray-500"}`}
                  style={on ? {backgroundColor: color} : undefined}>
                <IconCheck className="h-3 w-3"/>
            </span>
        </button>
    );
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

/** A source row washed in its colour while visible; click anywhere to toggle the week view. */
function ColourRow({source}: { source: SidebarSource }) {
    const wash = source.inCal;
    return (
        <div role="button" tabIndex={source.disabled ? -1 : 0} aria-pressed={source.inCal}
             onClick={() => !source.disabled && source.onToggleCal()}
             onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !source.disabled) { e.preventDefault(); source.onToggleCal(); } }}
             title={source.inCal ? "Click to hide in week view" : "Click to show in week view"}
             className={`group relative mb-0.5 flex cursor-pointer items-center gap-2 rounded-md py-0.5 pl-2 pr-1 transition-[background-color,filter] ${source.isolated ? "ring-1 ring-inset ring-blue-400" : ""} ${wash ? "hover:brightness-125" : "hover:bg-white/[0.04]"} ${source.disabled ? "cursor-not-allowed opacity-50" : ""}`}
             style={wash ? {
                 backgroundColor: `color-mix(in srgb, ${source.color} 14%, transparent)`,
                 boxShadow: `inset 3px 0 0 ${source.color}`,
             } : undefined}>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${source.inCal ? "text-gray-100" : "text-gray-600"}`}>{source.name}</span>
            <IsolateButton source={source}/>
            <CheckCell on={source.inCal} onClick={source.onToggleCal} disabled={source.disabled} color={source.color} label={`Show ${source.name} in week view`}/>
            <CheckCell on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled} color={source.color} label={`Include ${source.name} in statistics`}/>
        </div>
    );
}

/** Option 1: colour checks, washed rows, and section headers pinned while scrolling. */
function ColourList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
    const toggleSection = (key: string) => setClosed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    return (
        <div className={`${shell} w-64`}>
            <div className="flex items-center gap-1 py-2 pl-2 pr-1">
                <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed}/>
                <span className="flex-1 text-sm font-semibold text-white">Sources</span>
                <span className="w-6"/>
                <span className="flex w-6 justify-center text-gray-500" title="Week view"><IconWeekGrid className="h-3.5 w-3.5"/></span>
                <span className="flex w-6 justify-center text-gray-500" title="Statistics"><IconBarChart className="h-3.5 w-3.5"/></span>
            </div>
            <div className="pb-3">
                {sections.map((section) => {
                    const open = !closed.has(section.key);
                    return (
                        <div key={section.key}>
                            <ColourSectionHeader section={section} open={open} onToggleOpen={() => toggleSection(section.key)}/>
                            {open && <div className="px-1 py-1">
                                {section.items.map((source) => <ColourRow key={source.key} source={source}/>)}
                                <Notes section={section}/>
                            </div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ================================================================ option 2: minimal list

function HoverButton({on, onClick, label, disabled, children}: {
    on: boolean; onClick: () => void; label: string; disabled?: boolean; children: ReactNode;
}) {
    return (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-all focus-visible:opacity-100 disabled:opacity-30 group-hover:opacity-100 ${on ? "text-gray-300" : "text-gray-600"} hover:bg-gray-800 hover:text-white`}>
            {children}
        </button>
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

/** At rest every row looks the same; hovering reveals its state and the controls that change it. */
function MinimalRow({source}: { source: SidebarSource }) {
    return (
        <div className="group flex h-7 items-center gap-2 rounded-md pl-2 hover:bg-white/[0.04]">
            <button type="button" onClick={source.onToggleCal} disabled={source.disabled}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    title={source.inCal ? "Hide in week view" : "Show in week view"}>
                <span className={`h-2 w-2 shrink-0 rounded-full transition-opacity ${source.inCal ? "" : "group-hover:opacity-25"}`}
                      style={{backgroundColor: source.color}}/>
                <span className={`truncate text-[13px] text-gray-200 transition-colors ${source.inCal ? "" : "group-hover:text-gray-600"}`}>{source.name}</span>
            </button>
            <HoverButton on={source.inCal} onClick={source.onToggleCal} disabled={source.disabled}
                         label={source.inCal ? "Hide in week view" : "Show in week view"}>
                <IconEye off={!source.inCal} className="h-3.5 w-3.5"/>
            </HoverButton>
            <HoverButton on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled}
                         label={source.inStats ? "Exclude from statistics" : "Include in statistics"}>
                <StatsGlyph on={source.inStats} className="h-3.5 w-3.5"/>
            </HoverButton>
            <IsolateButton source={source} quiet/>
        </div>
    );
}

/** Option 2: names only, with everything else on hover. */
function MinimalList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} w-60 px-2 py-3`}>
            <div className="mb-3 flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-gray-500">Sources</span>
                <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed}/>
            </div>
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
