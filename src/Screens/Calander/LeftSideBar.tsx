/**
 * The calendar's left "Sources" sidebar: one row per category, device, manual project
 * and Google calendar, each with week-view and stats toggles drawn in its colour.
 *
 * Chosen from a set of candidates compared live with Componants/DesignPicker.tsx.
 */

import {useState, type ReactNode} from "react";

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
    /** Higher sorts first among sources in the same on/off group (categories only). */
    priority?: number;
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

export default function LeftSideBar(props: VariantProps) {
    return (
        // Clicks here must not reach the calendar's deselect handler.
        <div className="relative flex h-full shrink-0" onClick={(e) => e.stopPropagation()}>
            {props.collapsed ? <CollapsedRail {...props}/> : <ColourList {...props}/>}
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

function IconChevron({open, className}: { open: boolean; className?: string }) {
    return <svg className={`${className ?? ""} transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 6l6 6-6 6"/>
    </svg>;
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

/** Sources shown in the week view first, then by priority; otherwise keeps the given order. */
function sortSources(items: SidebarSource[]) {
    return [...items].sort((a, b) =>
        Number(b.inCal) - Number(a.inCal) || (b.priority ?? 0) - (a.priority ?? 0));
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

/** Collapsed form: one swatch per source, click to toggle it in the week view. */
function CollapsedRail({sections, collapsed, onToggleCollapsed}: VariantProps) {
    return (
        <div className={`${shell} flex w-14 flex-col items-center gap-3 py-3`}>
            <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed}/>
            {sections.map((section) => (
                <div key={section.key} className="flex flex-col items-center gap-1.5 border-t border-gray-800 pt-3" title={section.title}>
                    <SectionIcon sectionKey={section.key} className="mb-0.5 h-3.5 w-3.5 text-gray-600"/>
                    {sortSources(section.items).map((source) => (
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

// ---------------------------------------------------------------- expanded sidebar

/** A week or stats toggle drawn as its icon: in the source's colour when on, dark grey and struck through when off. */
function CheckCell({on, onClick, label, disabled, color, kind}: {
    on: boolean; onClick: () => void; label: string; disabled?: boolean; color: string; kind: "week" | "stats";
}) {
    const Icon = kind === "week" ? IconWeekGrid : IconBarChart;
    return (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-pressed={on} aria-label={label} title={label}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40 hover:bg-white/[0.08] ${on ? "" : "text-gray-700 hover:text-gray-400"}`}
                style={on ? {color} : undefined}>
            <span className="relative">
                <Icon className="h-3.5 w-3.5"/>
                {!on && <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current"/>}
            </span>
        </button>
    );
}

const ALL_COLOR = "#94a3b8";

function AllCells({section}: { section: SidebarSection }) {
    const all = section.all;
    if (!all) return <span className="w-14"/>;
    return <>
        <CheckCell on={all.inCal} onClick={all.onToggleCal} disabled={all.disabled} color={ALL_COLOR} kind="week" label={`All ${section.title} in week view`}/>
        <CheckCell on={all.inStats} onClick={all.onToggleStats} disabled={all.disabled} color={ALL_COLOR} kind="stats" label={`All ${section.title} in statistics`}/>
    </>;
}

/** Pinned while its section scrolls past. */
function ColourSectionHeader({section, open, onToggleOpen}: { section: SidebarSection; open: boolean; onToggleOpen: () => void }) {
    return (
        <div className="sticky top-0 z-10 bg-black/95 px-1 pt-2 backdrop-blur">
            <div className="flex items-center gap-2 rounded-md py-0.5 pl-2 pr-1">
                <button type="button" onClick={onToggleOpen} aria-expanded={open} title={open ? `Collapse ${section.title}` : `Expand ${section.title}`}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-gray-500 hover:text-gray-200">
                    <span className="truncate text-xs font-medium">{section.title}</span>
                    <span className="text-[11px] tabular-nums text-gray-600">{onCount(section.items)}/{section.items.length}</span>
                </button>
                <span className="w-6"/>
                <AllCells section={section}/>
            </div>
        </div>
    );
}

/**
 * A source row; its colour shows only on its week and stats icons. Clicking the row sets week and stats
 * together: both off when both are on, otherwise both on.
 */
function ColourRow({source}: { source: SidebarSource }) {
    const bothOn = source.inCal && source.inStats;
    const toggleBoth = () => {
        if (source.disabled) return;
        if (source.inCal === bothOn) source.onToggleCal();
        if (source.inStats === bothOn) source.onToggleStats();
    };
    return (
        <div role="button" tabIndex={source.disabled ? -1 : 0} aria-pressed={bothOn}
             onClick={toggleBoth}
             onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBoth(); } }}
             title={bothOn ? "Click to hide in week view and stats" : "Click to show in week view and stats"}
             className={`group relative mb-0.5 flex cursor-pointer items-center gap-2 rounded-md py-0.5 pl-2 pr-1 transition-colors hover:bg-white/[0.04] ${source.isolated ? "ring-1 ring-inset ring-blue-400" : ""} ${source.disabled ? "cursor-not-allowed opacity-50" : ""}`}>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${source.inCal ? "text-gray-100" : "text-gray-600"}`}>{source.name}</span>
            <IsolateButton source={source}/>
            <CheckCell on={source.inCal} onClick={source.onToggleCal} disabled={source.disabled} color={source.color} kind="week" label={`Show ${source.name} in week view`}/>
            <CheckCell on={source.inStats} onClick={source.onToggleStats} disabled={source.disabled} color={source.color} kind="stats" label={`Include ${source.name} in statistics`}/>
        </div>
    );
}

/** The expanded sidebar: colour icons, and section headers pinned while scrolling. */
function ColourList({sections, collapsed, onToggleCollapsed}: VariantProps) {
    const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
    const toggleSection = (key: string) => setClosed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    return (
        <div className={`${shell} w-64`}>
            {/* The whole row collapses the sidebar, not just the chevron. */}
            <div className="px-1 pt-2">
                <button type="button" onClick={onToggleCollapsed} aria-label="Collapse filter sidebar" title="Collapse"
                        className="group flex w-full items-center gap-1 rounded-md py-1 pl-1 pr-1 text-left text-gray-500 transition-colors hover:bg-white/[0.04] hover:text-gray-200">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <IconChevron open={false} className={`h-3.5 w-3.5 ${collapsed ? "" : "rotate-180"}`}/>
                    </span>
                    <span className="flex-1 text-xs font-medium">Sources</span>
                </button>
            </div>
            <div className="pb-3">
                {sections.map((section) => {
                    const open = !closed.has(section.key);
                    return (
                        <div key={section.key}>
                            <ColourSectionHeader section={section} open={open} onToggleOpen={() => toggleSection(section.key)}/>
                            {open && <div className="px-1 py-1">
                                {sortSources(section.items).map((source) => <ColourRow key={source.key} source={source}/>)}
                                <Notes section={section}/>
                            </div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
