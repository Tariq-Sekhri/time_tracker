import type {ExportFormat, ExportOptions, FrameworkId} from "../types.ts";
import {CheckMark, radioKeyDown} from "./common.tsx";
import {FORMAT_ICONS} from "./icons.tsx";
import {FRAMEWORKS} from "./scope.ts";

const FORMATS: {id: ExportFormat; label: string; ext: string; description: string}[] = [
    {id: "xlsx", label: "Excel", ext: ".xlsx", description: "Formatted workbook with summary"},
    {id: "csv", label: "CSV", ext: ".csv", description: "Plain spreadsheet for any tool"},
    {id: "pdf", label: "PDF", ext: ".pdf", description: "Shareable report"},
    {id: "json", label: "JSON", ext: ".json", description: "Portable data, re-importable"},
];

/** Format cards, plus the compatibility layout and user fields for CSV/Excel. */
export default function FormatPicker({options, manualSelected, onChange}: {
    options: ExportOptions;
    /** Manual entries are part of the export (layouts only change those). */
    manualSelected: boolean;
    onChange: (patch: Partial<ExportOptions>) => void;
}) {
    const tabular = options.format === "csv" || options.format === "xlsx";
    const framework = FRAMEWORKS.find((item) => item.id === options.framework) ?? FRAMEWORKS[0];
    const setFramework = (id: FrameworkId) => {
        // Column keys differ per layout, so a custom manual-entry column list no longer applies.
        const {manual_entries: _dropped, ...columns} = options.columns;
        onChange({framework: id, columns});
    };
    const formatIds = FORMATS.map((item) => item.id);
    const frameworkIds = FRAMEWORKS.map((item) => item.id);

    return <div className="dt-section" style={{gap: 16}}>
        <div className="dt-format-grid" role="radiogroup" aria-label="Export format"
            onKeyDown={(event) => radioKeyDown(event, formatIds, options.format, (format) => onChange({format}), (id) => `dt-format-${id}`)}>
            {FORMATS.map((item) => {
                const Icon = FORMAT_ICONS[item.id];
                const checked = options.format === item.id;
                return <button key={item.id} id={`dt-format-${item.id}`} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
                    className="dt-format-card" onClick={() => onChange({format: item.id})}>
                    <span className="dt-format-icon"><Icon /></span>
                    <strong>{item.label}<small>{item.ext}</small></strong>
                    <p>{item.description}</p>
                    <CheckMark />
                </button>;
            })}
        </div>

        {tabular && <div className="dt-subpanel">
            <div>
                <span className="dt-field-label" id="dt-layout-label">Layout / compatibility</span>
                <p className="settings-muted">Layouts only change how manual time entries are laid out; other datasets always use the Time Tracker layout.</p>
            </div>
            <div className="dt-layout-grid" role="radiogroup" aria-labelledby="dt-layout-label"
                onKeyDown={(event) => radioKeyDown(event, frameworkIds, options.framework, setFramework, (id) => `dt-layout-${id}`)}>
                {FRAMEWORKS.map((item) => {
                    const checked = options.framework === item.id;
                    return <button key={item.id} id={`dt-layout-${item.id}`} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
                        className="dt-layout-option" onClick={() => setFramework(item.id)}>
                        <strong>{item.label}</strong><span>{item.hint}</span>
                    </button>;
                })}
            </div>
            {framework.id !== "native" && !manualSelected && <p className="settings-muted" style={{color: "var(--tt-warning)"}}>
                Select Manual time entries above to use the {framework.label} layout.
            </p>}
            {framework.needsUser && <div className="dt-field-grid">
                <label className="dt-field">
                    <span>{framework.id === "harvest" ? "Your name (first and last)" : "Your name"}</span>
                    <input className="dt-input" value={options.userName} placeholder="Jane Doe" autoComplete="name"
                        onChange={(event) => onChange({userName: event.target.value})} />
                </label>
                <label className="dt-field">
                    <span>Email</span>
                    <input className="dt-input" type="email" value={options.userEmail} placeholder="jane@example.com" autoComplete="email"
                        onChange={(event) => onChange({userEmail: event.target.value})} />
                    <small>{framework.label} matches entries to a user in your workspace.</small>
                </label>
            </div>}
        </div>}
    </div>;
}
