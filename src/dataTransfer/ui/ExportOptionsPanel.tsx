import type {ExportInclude} from "../../api/dataTransfer.ts";
import type {ColumnDef, DatasetKey, ExportOptions, PdfSections, Rounding} from "../types.ts";
import ColumnPicker from "./ColumnPicker.tsx";
import {Banner} from "./common.tsx";
import {DATASETS} from "./scope.ts";

const ROUNDINGS: Rounding[] = [0, 1, 5, 6, 10, 15, 30, 60];

const PDF_SECTIONS: {key: keyof PdfSections; label: string; hint: string}[] = [
    {key: "overview", label: "Overview", hint: "Total, manual and activity time, active days"},
    {key: "categoryBreakdown", label: "Category breakdown", hint: "Chart and table per category"},
    {key: "dailyBreakdown", label: "Daily breakdown", hint: "Chart and table per day"},
    {key: "deviceBreakdown", label: "Device breakdown", hint: "Activity time per device"},
    {key: "detail", label: "Detailed entries", hint: "Itemised tables of the included data"},
    {key: "signature", label: "Signature line", hint: "Approver signature and date"},
];

/** PDF accent colors. These end up in the document, so they are fixed hex values rather than theme variables. */
const ACCENTS = ["#2563eb", "#0891b2", "#059669", "#65a30d", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#334155"];

function Select<T extends string | number>({label, value, options, onChange, hint}: {
    label: string;
    value: T;
    options: {value: T; label: string}[];
    onChange: (value: T) => void;
    hint?: string;
}) {
    return <label className="dt-field">
        <span>{label}</span>
        <select className="dt-select" value={String(value)}
            onChange={(event) => onChange(options.find((option) => String(option.value) === event.target.value)!.value)}>
            {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
        </select>
        {hint && <small>{hint}</small>}
    </label>;
}

export default function ExportOptionsPanel({options, include, columnsFor, onChange}: {
    options: ExportOptions;
    include: ExportInclude;
    columnsFor: (dataset: DatasetKey, framework: ExportOptions["framework"]) => ColumnDef[];
    onChange: (patch: Partial<ExportOptions>) => void;
}) {
    const {format} = options;
    if (format === "json") {
        return <Banner tone="info">
            <strong>Portable data export.</strong> JSON keeps every field of the datasets selected above — including categories, rules and raw logs — so
            it can be re-imported here later, on this or another computer. Columns and formatting options don't apply.
        </Banner>;
    }
    const tabular = format === "csv" || format === "xlsx";
    const setPdf = (patch: Partial<ExportOptions["pdf"]>) => onChange({pdf: {...options.pdf, ...patch}});
    const columnSets = tabular ? DATASETS.filter((item) => include[item.key])
        .map((item) => ({item, defs: columnsFor(item.key, options.framework)}))
        .filter(({defs}) => defs.length > 0) : [];

    return <div className="dt-section" style={{gap: 18}}>
        {format === "pdf" && <div className="dt-subpanel">
            <span className="dt-subheading">Report</span>
            <div className="dt-field-grid">
                <label className="dt-field"><span>Title</span>
                    <input className="dt-input" value={options.pdf.title} placeholder="Time report" onChange={(event) => setPdf({title: event.target.value})} /></label>
                <label className="dt-field"><span>Prepared by</span>
                    <input className="dt-input" value={options.pdf.preparedBy} placeholder="Your name or company" onChange={(event) => setPdf({preparedBy: event.target.value})} /></label>
                <label className="dt-field"><span>Prepared for</span>
                    <input className="dt-input" value={options.pdf.preparedFor} placeholder="Client or manager" onChange={(event) => setPdf({preparedFor: event.target.value})} /></label>
                <Select label="Orientation" value={options.pdf.orientation} onChange={(orientation) => setPdf({orientation})}
                    options={[{value: "portrait", label: "Portrait"}, {value: "landscape", label: "Landscape"}]} />
                <Select label="Page size" value={options.pdf.pageSize} onChange={(pageSize) => setPdf({pageSize})}
                    options={[{value: "a4", label: "A4"}, {value: "letter", label: "US Letter"}]} />
            </div>
            <div>
                <span className="dt-field-label" id="dt-accent-label">Accent color</span>
                <div className="dt-swatches" role="radiogroup" aria-labelledby="dt-accent-label" style={{marginTop: 8}}>
                    {ACCENTS.map((color) => <button key={color} type="button" role="radio" className="dt-swatch" style={{background: color}}
                        aria-checked={options.pdf.accentColor.toLowerCase() === color} aria-label={`Accent ${color}`}
                        onClick={() => setPdf({accentColor: color})} />)}
                    <label className="dt-swatch dt-swatch-custom" title="Custom color"
                        data-checked={!ACCENTS.includes(options.pdf.accentColor.toLowerCase())}>
                        <input type="color" aria-label="Custom accent color" value={options.pdf.accentColor}
                            onChange={(event) => setPdf({accentColor: event.target.value})} />
                    </label>
                </div>
            </div>
            <fieldset>
                <legend className="dt-field-label" style={{marginBottom: 8}}>Sections</legend>
                <div className="dt-field-grid" style={{gap: 6}}>
                    {PDF_SECTIONS.map((section) => <label key={section.key} className="dt-check">
                        <input type="checkbox" checked={options.pdf.sections[section.key]}
                            onChange={(event) => setPdf({sections: {...options.pdf.sections, [section.key]: event.target.checked}})} />
                        <span>{section.label}<small>{section.hint}</small></span>
                    </label>)}
                </div>
            </fieldset>
        </div>}

        <div className="dt-subpanel">
            <span className="dt-subheading">Formatting</span>
            <div className="dt-field-grid">
                <Select label="Duration" value={options.durationFormat} onChange={(durationFormat) => onChange({durationFormat})}
                    options={[{value: "hms", label: "1:02:03 (h:mm:ss)"}, {value: "hm", label: "1:02 (h:mm)"}, {value: "decimal", label: "1.03 h (decimal)"}]} />
                <Select label="Date" value={options.dateFormat} onChange={(dateFormat) => onChange({dateFormat})}
                    options={[{value: "iso", label: "2026-03-04"}, {value: "us", label: "03/04/2026 (US)"}, {value: "eu", label: "04/03/2026 (EU)"}]} />
                <Select label="Time" value={options.timeFormat} onChange={(timeFormat) => onChange({timeFormat})}
                    options={[{value: "24h", label: "24-hour (14:05)"}, {value: "12h", label: "12-hour (2:05 PM)"}]} />
                <Select label="Round durations" value={options.rounding} onChange={(rounding) => onChange({rounding})}
                    hint="Applies to durations and totals; start and end times stay exact."
                    options={ROUNDINGS.map((value) => ({value, label: value === 0 ? "Exact" : value === 60 ? "1 hour" : `${value} min`}))} />
                {options.rounding !== 0 && <Select label="Rounding direction" value={options.roundingMode} onChange={(roundingMode) => onChange({roundingMode})}
                    options={[{value: "nearest", label: "Nearest"}, {value: "up", label: "Always up"}, {value: "down", label: "Always down"}]} />}
                <Select label={format === "pdf" ? "Group details by" : format === "csv" ? "Summary file" : "Summary sheet"} value={options.summaryGrouping}
                    onChange={(summaryGrouping) => onChange({summaryGrouping})}
                    hint={format === "pdf" ? "Groups the detailed tables with subtotals." : format === "csv" ? "Adds a separate CSV with totals. Multiple files are saved to a folder." : "Adds a Summary sheet with totals."}
                    options={[{value: "none", label: format === "pdf" ? "No grouping" : "No summary"}, {value: "day", label: "Day"}, {value: "week", label: "Week"}, {value: "category", label: "Category"}, {value: "device", label: "Device"}]} />
                {format === "csv" && <Select label="Delimiter" value={options.csvDelimiter} onChange={(csvDelimiter) => onChange({csvDelimiter})}
                    hint="Semicolon suits Excel in regions that use a decimal comma."
                    options={[{value: ",", label: "Comma ( , )"}, {value: ";", label: "Semicolon ( ; )"}, {value: "\t", label: "Tab"}]} />}
            </div>
            {format === "csv" && <label className="dt-check">
                <input type="checkbox" checked={options.csvBom} onChange={(event) => onChange({csvBom: event.target.checked})} />
                <span>Excel-friendly UTF-8 (BOM)<small>Keeps accented characters intact when the file is opened in Excel.</small></span>
            </label>}
        </div>

        {tabular && <div className="dt-section" style={{gap: 10}}>
            <span className="dt-subheading">Columns</span>
            {columnSets.length === 0
                ? <p className="settings-muted">Select at least one dataset to choose its columns.</p>
                : <div className="dt-columns">
                    {columnSets.map(({item, defs}) => <ColumnPicker key={`${item.key}-${options.framework}`} title={item.label} defs={defs}
                        fixedOrder={item.key === "manual_entries" && options.framework === "harvest"}
                        custom={options.columns[item.key]}
                        onChange={(next) => {
                            const columns = {...options.columns};
                            if (next) columns[item.key] = next;
                            else delete columns[item.key];
                            onChange({columns});
                        }} />)}
                </div>}
            {format === "csv" && columnSets.length > 1 && <p className="settings-muted">CSV writes one file per dataset; you'll be asked for a folder.</p>}
        </div>}
    </div>;
}
