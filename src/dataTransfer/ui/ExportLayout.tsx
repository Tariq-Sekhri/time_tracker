import {useState, type ReactNode} from "react";
import "./exportLayouts.css";

type Slots = {preset: ReactNode; data: ReactNode; range: ReactNode; filters: ReactNode; format: ReactNode; options: ReactNode; footer: ReactNode};
type Overview = {summary: string; format: string; range: string | null; datasets: {label: string; count?: number}[]; blocker?: string; scopeSummary?: string};
const STEPS = ["Choose data", "Design output", "Review & export"];

function SelectionSummary({overview}: {overview: Overview}) {
    return <aside className="ex-overview" aria-label="Export selection summary">
        <div className="ex-eyebrow">Your export</div>
        <h3>{overview.format} export</h3><p>{overview.range ?? "Choose a date range"}</p>
        <div className="ex-rule" />
        <div className="ex-overview-items">{overview.datasets.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.count?.toLocaleString() ?? "—"}</strong></div>)}</div>
        {!overview.datasets.length && <p>No data selected</p>}
        <div className="ex-overview-status" data-blocked={!!overview.blocker}>{overview.blocker ?? "Ready to preview"}</div>
        <small>Selection summary. Use Preview to see the generated file.</small>
    </aside>;
}

export default function ExportLayout({slots: s, overview, onResetScope, toolbar}: {slots: Slots; overview: Overview; onResetScope?: () => void; toolbar?: ReactNode}) {
    const [step, setStep] = useState(0);
    const pages = [s.data, <>{s.format}{s.options}</>, <SelectionSummary overview={overview} />];
    return <div className="ex-root">
        <div className="ex-toolbar"><div className="ex-preset">{s.preset}</div>{toolbar}</div>
        <details className="ex-scope-control">
            <summary><span className="ex-eyebrow">Scope</span><span className="ex-scope-value">{overview.scopeSummary ?? overview.range ?? "Everything"}</span><span className="ex-scope-change">Change</span></summary>
            <div className="ex-scope-content">
                {onResetScope && <div className="ex-scope-reset"><button type="button" className="dt-button" onClick={onResetScope}>Use everything</button></div>}
                <div className="ex-scope-fields">{s.range}{s.filters}</div>
            </div>
        </details>
        <div className="ex-focus">
            <nav className="ex-step-rail" aria-label="Export workflow">
                {STEPS.map((label, index) => <button type="button" key={label} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}
            </nav>
            <div className="ex-focus-main">
                <header><span className="ex-eyebrow">{String(step + 1).padStart(2, "0")} / 03</span><h3>{STEPS[step]}</h3></header>
                <div className="ex-step-panels">
                    {pages.map((content, index) => <div key={index} hidden={step !== index} className="ex-stack">{content}</div>)}
                    <div className="ex-step-actions">
                        <button type="button" className="dt-button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>Back</button>
                        <span>{step + 1} of {STEPS.length}</span>
                        <button type="button" className="dt-button dt-button-primary" disabled={step === STEPS.length - 1} onClick={() => setStep(value => value + 1)}>Next</button>
                    </div>
                </div>
            </div>
        </div>
        <div className="ex-actions">{s.footer}</div>
    </div>;
}
