import {useState, type ReactNode} from "react";
import "./exportLayouts.css";

export const EXPORT_LAYOUTS = [
    {id: 1, name: "Workbench", hint: "Scope on the left, output settings on the right"},
    {id: 2, name: "Review desk", hint: "A settings column beside a live selection summary"},
    {id: 3, name: "Guided", hint: "Four short steps with back and next controls"},
    {id: 4, name: "Notebook", hint: "Expandable chapters with a compact contents rail"},
    {id: 5, name: "Inspector", hint: "A dense property sheet with labels in a left column"},
    {id: 6, name: "Pipeline", hint: "Three columns: collect, refine, and package"},
    {id: 7, name: "Library", hint: "Data library on the left and a report composer on the right"},
    {id: 8, name: "Studio", hint: "A central report outline between scope and presentation panels"},
    {id: 9, name: "Dashboard", hint: "An overview strip and a grid of independent controls"},
    {id: 10, name: "Focus", hint: "A vertical step rail and one focused panel at a time"},
] as const;
export const EXPORT_LAYOUT_KEY = "time-tracker:export-layout";
function initialLayout() {
    try {const saved = Number(localStorage.getItem(EXPORT_LAYOUT_KEY)); return EXPORT_LAYOUTS.some(item => item.id === saved) ? saved : 1;} catch {return 1;}
}
type Slots = {preset: ReactNode; data: ReactNode; range: ReactNode; filters: ReactNode; format: ReactNode; options: ReactNode; footer: ReactNode};
type Overview = {summary: string; format: string; range: string | null; datasets: {label: string; count?: number}[]; blocker?: string};
const steps = ["Choose data", "Set scope", "Design output", "Review & export"];

function SelectionSummary({overview, paper = false}: {overview: Overview; paper?: boolean}) {
    return <aside className={`ex-overview ${paper ? "ex-paper" : ""}`} aria-label="Export selection summary">
        <div className="ex-eyebrow">{paper ? "Report outline" : "Your export"}</div>
        <h3>{overview.format} export</h3><p>{overview.range ?? "Choose a date range"}</p>
        <div className="ex-rule" />
        <div className="ex-overview-items">{overview.datasets.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.count?.toLocaleString() ?? "—"}</strong></div>)}</div>
        {!overview.datasets.length && <p>No data selected</p>}
        <div className="ex-overview-status" data-blocked={!!overview.blocker}>{overview.blocker ?? "Ready to preview"}</div>
        <small>Selection summary. Use Preview to see the generated file.</small>
    </aside>;
}
function JumpNav() {
    return <nav className="ex-jumps" aria-label="Export sections">{[["what", "Data"], ["range", "Dates"], ["filters", "Filters"], ["format", "Format"], ["options", "Details"]].map(([id, name], index) => <button type="button" key={id} onClick={() => {
        const target = document.getElementById(`dt-export-${id}`);
        const chapter = target?.closest("details");
        if (chapter) chapter.open = true;
        target?.scrollIntoView({behavior: "smooth", block: "start"});
    }}><span>{String(index + 1).padStart(2, "0")}</span>{name}</button>)}</nav>;
}
export default function ExportLayout({slots: s, overview}: {slots: Slots; overview: Overview}) {
    const [layout, setLayout] = useState(initialLayout);
    const [step, setStep] = useState(0);
    const selected = EXPORT_LAYOUTS.find(item => item.id === layout)!;
    const summary = <SelectionSummary overview={overview} />;
    const pageSteps = [<>{s.data}</>, <>{s.range}{s.filters}</>, <>{s.format}{s.options}</>, <>{summary}</>];
    const choose = (next: number) => {setLayout(next); try {localStorage.setItem(EXPORT_LAYOUT_KEY, String(next));} catch {/* Layout choice still works without storage. */}};
    const stepNav = (vertical: boolean) => <nav className={vertical ? "ex-step-rail" : "ex-step-tabs"} aria-label="Export workflow">{steps.map((label, index) => <button type="button" key={label} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>;
    const stepPanels = <div className="ex-step-panels">{pageSteps.map((content, index) => <div key={index} hidden={step !== index} className="ex-stack">{content}</div>)}<div className="ex-step-actions"><button type="button" className="dt-button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>Back</button><span>{step + 1} of {steps.length}</span><button type="button" className="dt-button dt-button-primary" disabled={step === steps.length - 1} onClick={() => setStep(value => value + 1)}>Next</button></div></div>;
    return <div className={`ex-root ex-layout-${layout}`}>
        <div className="ex-picker"><span className="ex-eyebrow">Export UI</span><div className="ex-picker-segments" role="radiogroup" aria-label="Export layout" onKeyDown={event => {
            const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!delta && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault(); const next = event.key === "Home" ? 1 : event.key === "End" ? 10 : (layout - 1 + delta + 10) % 10 + 1;
            choose(next); document.getElementById(`ex-layout-${next}`)?.focus();
        }}>{EXPORT_LAYOUTS.map(item => <button id={`ex-layout-${item.id}`} key={item.id} type="button" role="radio" aria-label={`${item.id}. ${item.name}`} aria-checked={layout === item.id} tabIndex={layout === item.id ? 0 : -1} title={item.hint} onClick={() => choose(item.id)}>{item.id}</button>)}</div><strong>{selected.name}</strong><small>{selected.hint}</small></div>
        <div className="ex-preset">{s.preset}</div>
        {layout === 1 && <div className="ex-workbench"><div className="ex-stack ex-scope"><div className="ex-zone-title">Scope</div>{s.filters}{s.range}{s.data}</div><div className="ex-stack ex-output"><div className="ex-zone-title">Output</div>{s.format}{s.options}</div></div>}
        {layout === 2 && <div className="ex-review-desk"><div className="ex-stack">{s.data}{s.range}{s.filters}{s.format}{s.options}</div><div className="ex-review-rail">{summary}</div></div>}
        {layout === 3 && <div className="ex-wizard">{stepNav(false)}{stepPanels}</div>}
        {layout === 4 && <div className="ex-notebook"><JumpNav /><div className="ex-chapters">{[["01", "Data & sources", s.data], ["02", "Dates & categories", <>{s.range}{s.filters}</>], ["03", "File & presentation", <>{s.format}{s.options}</>]].map(([number, label, content], index) => <details key={String(number)} open={index === 0}><summary><span>{number}</span><strong>{label}</strong><span className="ex-expand">+</span></summary><div className="ex-stack">{content}</div></details>)}</div></div>}
        {layout === 5 && <div className="ex-property-sheet">{[["Data", "Choose the records to include", s.data], ["Period", "Set the reporting window", s.range], ["Selection", "Narrow by category or device", s.filters], ["File", "Choose a format", s.format], ["Details", "Style and optional pricing", s.options]].map(([title, hint, content]) => <div className="ex-property-row" key={String(title)}><header><strong>{title}</strong><small>{hint}</small></header><div>{content}</div></div>)}</div>}
        {layout === 6 && <div className="ex-board">{[["01", "Collect", <>{s.data}{s.range}</>], ["02", "Refine", <>{s.filters}{summary}</>], ["03", "Package", <>{s.format}{s.options}</>]].map(([number, title, content]) => <div className="ex-board-lane" key={String(number)}><header><span>{number}</span><h3>{title}</h3></header><div className="ex-stack">{content}</div></div>)}</div>}
        {layout === 7 && <div className="ex-library"><aside className="ex-stack"><div className="ex-zone-title">Source library</div>{s.data}{s.filters}</aside><main className="ex-stack"><div className="ex-zone-title">Compose export</div>{s.range}{s.format}{s.options}</main></div>}
        {layout === 8 && <div className="ex-studio"><aside className="ex-stack ex-studio-scope">{s.filters}{s.range}{s.data}</aside><div className="ex-canvas"><SelectionSummary overview={overview} paper /></div><aside className="ex-stack ex-studio-properties">{s.format}{s.options}</aside></div>}
        {layout === 9 && <><div className="ex-metrics"><div><small>Output</small><strong>{overview.format}</strong></div><div><small>Period</small><strong>{overview.range ?? "Not selected"}</strong></div><div><small>Datasets</small><strong>{overview.datasets.length}</strong></div><div data-blocked={!!overview.blocker}><small>Status</small><strong>{overview.blocker ? "Needs attention" : "Ready"}</strong></div></div><div className="ex-dashboard"><div className="ex-dash-scope ex-stack">{s.filters}{s.range}</div><div className="ex-dash-data">{s.data}</div><div className="ex-dash-format">{s.format}</div><div className="ex-dash-options">{s.options}</div></div></>}
        {layout === 10 && <div className="ex-focus">{stepNav(true)}<div className="ex-focus-main"><header><span className="ex-eyebrow">{String(step + 1).padStart(2, "0")} / 04</span><h3>{steps[step]}</h3></header>{stepPanels}</div></div>}
        <div className="ex-actions">{s.footer}</div>
    </div>;
}
