import {Fragment, useMemo, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {open} from "@tauri-apps/plugin-dialog";
import {importDataset, readImportFile, type ImportReport, type ImportRequest} from "../../api/dataTransfer.ts";
import {toErrorString} from "../../types/common.ts";
import {convertRows, guessMapping, importFieldDefs, parseImportFile} from "../formats/index.ts";
import type {ColumnMapping, ImportTableOptions, ParsedImportFile} from "../types.ts";
import {Banner, Section} from "./common.tsx";
import {BACKUP_SECTIONS, backupRequest, countByStatus, pathLabel, requestIsEmpty, reviewRows, sampleValues, tableRequest, validateMapping, type BackupSection} from "./importLogic.ts";
import {baseName} from "./preview.ts";
import {IconCheck, IconUpload, Spinner} from "./icons.tsx";

const INITIAL_OPTIONS: ImportTableOptions = {mapping: {}, clientHandling: "as_parent_category", dateFormat: "auto", dayStartHour: 9, fallbackCategory: []};
const INITIAL_SECTIONS = Object.fromEntries(BACKUP_SECTIONS.map(section => [section.key, true])) as Record<BackupSection, boolean>;

export default function ImportView() {
    const client = useQueryClient();
    const input = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<ParsedImportFile | null>(null);
    const [sheet, setSheet] = useState(0);
    const [options, setOptions] = useState<ImportTableOptions>(INITIAL_OPTIONS);
    const [sections, setSections] = useState(INITIAL_SECTIONS);
    const [duplicates, setDuplicates] = useState<"skip" | "import">("skip");
    const [createCategories, setCreateCategories] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [review, setReview] = useState<{request: ImportRequest; report: ImportReport} | null>(null);
    const [result, setResult] = useState<ImportReport | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const table = file?.kind === "table" ? file.tables[sheet] : null;
    const converted = useMemo(() => table ? convertRows(table, options) : null, [table, options]);
    const tableData = useMemo(() => tableRequest(converted ?? [], duplicates, createCategories), [converted, duplicates, createCategories]);
    const request = file?.kind === "backup" ? backupRequest(file.request, sections, duplicates, createCategories) : tableData.request;
    const mappingCheck = validateMapping(options.mapping);
    const rows = reviewRows(request.manual_entries, file?.kind === "table" ? tableData.entryRows : null, converted, review?.report ?? null);
    const counts = countByStatus(rows);
    const visibleRows = rows.filter(row => statusFilter === "all" || row.status === statusFilter);
    const step = result ? 3 : review ? 2 : file ? 1 : 0;
    const edit = () => {setReview(null); setResult(null); setError(null);};
    const load = async (name: string, bytes: Uint8Array) => {
        if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("Choose a file smaller than 100 MB.");
        const parsed = await parseImportFile(name, bytes);
        setFile(parsed); setSheet(0); setSections({...INITIAL_SECTIONS}); setStatusFilter("all");
        setOptions({...INITIAL_OPTIONS, mapping: parsed.kind === "table" ? guessMapping(parsed.tables[0].headers, parsed.detectedFramework) : {}});
        edit();
    };
    const chooseFile = async () => {
        setBusy(true); setError(null);
        try {
            const path = await open({title: "Import time data", multiple: false, filters: [{name: "Time data", extensions: ["csv", "tsv", "xlsx", "json"]}]});
            if (typeof path === "string") await load(baseName(path), await readImportFile(path));
        } catch (cause) {setError(toErrorString(cause));} finally {setBusy(false);}
    };
    const loadBrowserFile = async (picked?: File) => {
        if (!picked || busy) return;
        setBusy(true); setError(null);
        try {
            if (picked.size > 100 * 1024 * 1024) throw new Error("Choose a file smaller than 100 MB.");
            await load(picked.name, new Uint8Array(await picked.arrayBuffer()));
        } catch (cause) {setError(toErrorString(cause));} finally {setBusy(false); if (input.current) input.current.value = "";}
    };
    const reviewImport = async () => {
        setBusy(true); setError(null);
        try {const report = await importDataset({...request, dry_run: true}); setReview({request, report});}
        catch (cause) {setError(toErrorString(cause));} finally {setBusy(false);}
    };
    const commitImport = async () => {
        if (!review || busy) return;
        setBusy(true); setError(null);
        try {
            const report = await importDataset({...review.request, dry_run: false});
            setResult(report);
            await client.invalidateQueries();
        } catch (cause) {setError(toErrorString(cause));} finally {setBusy(false);}
    };
    const metadataCount = (report: ImportReport) => report.manual_categories_created.length + report.activity_categories_created.length + report.category_rules_added + report.app_groups_added + report.skipped_apps_added + report.devices_added;
    return <div className="dt-root" aria-busy={busy}>
        <ol className="dt-stepper" aria-label="Import progress">{["Choose file", "Map & select", "Review", "Complete"].map((label, index) => <li key={label} data-state={step === index ? "current" : step > index ? "done" : undefined} aria-current={step === index ? "step" : undefined}><span>{step > index ? <IconCheck className="dt-icon-sm" /> : index + 1}</span>{label}</li>)}</ol>
        {error && <Banner tone="danger" role="alert">{error}</Banner>}
        {!file && <section className="settings-panel"><div className="dt-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); void loadBrowserFile(event.dataTransfer.files[0]);}}>
            <span className="dt-dropzone-icon"><IconUpload /></span><h3>Bring your time with you</h3><p>Import a Time Tracker JSON export, a CSV, or an Excel workbook. Preview changes before anything is saved.</p>
            <div className="dt-sources">{["Time Tracker", "Clockify", "Toggl", "Harvest", "Custom CSV"].map(name => <span className="dt-badge" key={name}>{name}</span>)}</div>
            <button type="button" className="dt-button dt-button-primary dt-button-lg" disabled={busy} onClick={() => void chooseFile()}>{busy ? <Spinner /> : <IconUpload />} Choose file</button>
            <p>Or drop a file here · CSV, TSV, XLSX, JSON · up to 100 MB</p>
            <input ref={input} className="dt-sr-only" type="file" aria-label="Import file" accept=".csv,.tsv,.xlsx,.json" onChange={event => void loadBrowserFile(event.target.files?.[0])} />
        </div></section>}
        {file && !result && <>
            <div className="dt-file-bar"><span className="dt-file-name">{file.fileName}<small>{file.kind === "backup" ? "Time Tracker JSON export" : `${file.detectedFramework ?? "Custom"} layout · ${table?.rows.length.toLocaleString()} rows`}</small></span><button type="button" className="dt-button" disabled={busy} onClick={() => {setFile(null); edit();}}>Change file</button></div>
            {!review && <>
                {file.kind === "backup" ? <Section id="dt-import-sections" title="Choose what to import" description="Existing data stays in place. Selected data is merged with it."><div className="dt-section-list">{BACKUP_SECTIONS.map(section => <label className="dt-section-item" key={section.key}><input type="checkbox" checked={sections[section.key]} onChange={event => {setSections({...sections, [section.key]: event.target.checked}); edit();}} /><span>{section.label}<small>{section.hint}</small></span><span className="dt-badge">{file.request[section.key].length}</span></label>)}</div><Banner tone="info">Activity sessions are derived reports. Raw activity logs restore tracked activity; category rules rebuild its sessions.</Banner></Section> : table && <Section id="dt-import-mapping" title="Match your columns" description="Check the suggested matches and sample values. Spreadsheet rows become manual time entries.">
                    {file.tables.length > 1 && <label className="dt-field"><span>Worksheet</span><select className="dt-select" value={sheet} onChange={event => {const next = Number(event.target.value); setSheet(next); setOptions({...options, mapping: guessMapping(file.tables[next].headers, file.detectedFramework)}); edit();}}>{file.tables.map((item, index) => <option key={index} value={index}>{item.name} ({item.rows.length} rows)</option>)}</select></label>}
                    <div className="dt-mapping"><div className="dt-mapping-head">Time Tracker field</div><div className="dt-mapping-head">File column</div><div className="dt-mapping-head">Sample values</div>{importFieldDefs().map(field => <Fragment key={field.field}><div className="dt-mapping-field"><strong>{field.label}</strong><small>{field.help}</small></div><div className="dt-mapping-select"><select className="dt-select" aria-label={`Column for ${field.label}`} value={options.mapping[field.field] ?? ""} onChange={event => {const mapping: ColumnMapping = {...options.mapping}; if (event.target.value === "") delete mapping[field.field]; else mapping[field.field] = Number(event.target.value); setOptions({...options, mapping}); edit();}}><option value="">Don't import</option>{table.headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>)}</select></div><div className="dt-mapping-samples">{options.mapping[field.field] != null && sampleValues(table, options.mapping[field.field]!).map(value => <span className="dt-sample" key={value} title={value}>{value}</span>)}</div></Fragment>)}</div>
                    {!mappingCheck.ok && <Banner tone="warning">{mappingCheck.errors.join(" ")}</Banner>}
                    <div className="dt-field-grid"><label className="dt-field"><span>Date order</span><select className="dt-select" value={options.dateFormat} onChange={event => {setOptions({...options, dateFormat: event.target.value as ImportTableOptions["dateFormat"]}); edit();}}><option value="auto">Detect automatically</option><option value="iso">Year / month / day</option><option value="us">Month / day / year</option><option value="eu">Day / month / year</option></select></label>
                        <label className="dt-field"><span>Client column</span><select className="dt-select" value={options.clientHandling} onChange={event => {setOptions({...options, clientHandling: event.target.value as ImportTableOptions["clientHandling"]}); edit();}}><option value="as_parent_category">Use as parent category</option><option value="ignore">Ignore</option></select></label>
                        {mappingCheck.usesDayStart && <label className="dt-field"><span>Start hour for duration-only rows</span><input className="dt-input" type="number" min={0} max={23} value={options.dayStartHour} onChange={event => {setOptions({...options, dayStartHour: Math.max(0, Math.min(23, Number(event.target.value)))}); edit();}} /><small>Entries stack from this local hour on each day. Original clock times are unavailable.</small></label>}
                    </div><p className="settings-muted">Dates without an explicit timezone use this computer's local timezone. Choose a date order for ambiguous dates.</p>
                </Section>}
                <Section id="dt-import-behavior" title="Import options"><label className="dt-field"><span>Duplicate entries</span><select className="dt-select" value={duplicates} onChange={event => {setDuplicates(event.target.value as "skip" | "import"); edit();}}><option value="skip">Skip matching entries (recommended)</option><option value="import">Import matching manual entries again</option></select><small>Manual matches use title, start, and end. Existing raw log IDs are always skipped.</small></label><label className="dt-check"><input type="checkbox" checked={createCategories} onChange={event => {setCreateCategories(event.target.checked); edit();}} />Create missing categories</label></Section>
                <div className="dt-actions"><span className="settings-muted">Review validates the file without changing your data.</span><button className="dt-button dt-button-primary dt-button-lg" type="button" disabled={busy || requestIsEmpty(request) || (file.kind === "table" && !mappingCheck.ok)} onClick={() => void reviewImport()}>{busy && <Spinner />}Review import</button></div>
            </>}
            {review && <Section id="dt-import-review" title="Review your import" description="Check additions, duplicates, and rejected rows before importing.">
                <div className="dt-stats"><div className="dt-stat" data-tone="success"><small>Manual entries to add</small><strong>{review.report.manual_entries_imported}</strong></div><div className="dt-stat"><small>Activity logs to add</small><strong>{review.report.activity_logs_imported}</strong></div><div className="dt-stat" data-tone="warning"><small>Matching manual entries</small><strong>{counts.duplicate}</strong></div><div className="dt-stat" data-tone="danger"><small>Invalid manual rows</small><strong>{counts.error}</strong></div><div className="dt-stat"><small>Categories, rules &amp; devices</small><strong>{metadataCount(review.report)}</strong></div></div>
                {counts.error > 0 && <Banner tone="warning">Invalid rows will be skipped. Go back to fix mappings, or import the valid rows shown below.</Banner>}
                {rows.length > 0 && <><div className="dt-filter-tabs">{["all", "new", "duplicate", "error"].map(status => <button type="button" key={status} className="dt-chip" aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{status === "all" ? "All rows" : status === "new" ? "Ready" : status === "error" ? "Errors" : "Duplicates"}</button>)}</div><div className="dt-table-wrap nice-scrollbar"><table className="dt-table"><thead><tr>{["Row", "Status", "Title", "Category", "Start", "Hours / issue"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visibleRows.slice(0, 100).map(row => <tr key={row.key}><td>{row.sourceRow ?? "—"}</td><td><span className={`dt-status dt-status-${row.status}`}>{row.status === "new" ? "Ready" : row.status}</span></td><td>{row.entry?.title ?? "—"}</td><td>{row.entry ? pathLabel(row.entry.category_path) : "—"}</td><td>{row.entry ? new Date(row.entry.start_time * 1000).toLocaleString() : "—"}</td><td className="dt-wrap">{row.message ?? (row.entry ? ((row.entry.end_time - row.entry.start_time) / 3600).toFixed(2) : "—")}</td></tr>)}</tbody></table></div><p className="settings-muted">Showing {Math.min(100, visibleRows.length)} of {visibleRows.length.toLocaleString()} rows in this view. All valid rows are processed.</p></>}
                <div className="dt-actions"><button className="dt-button" type="button" disabled={busy} onClick={edit}>Back to mapping</button><button className="dt-button dt-button-primary dt-button-lg" type="button" disabled={busy || review.report.manual_entries_imported + review.report.activity_logs_imported + metadataCount(review.report) === 0} onClick={() => void commitImport()}>{busy ? <Spinner /> : <IconUpload />} Import data</button></div>
            </Section>}
        </>}
        {result && <Section id="dt-import-complete" title="Import complete"><div className="dt-result"><span className="dt-result-icon"><IconCheck /></span><h3>Your data is ready</h3><p>{result.manual_entries_imported.toLocaleString()} manual entries and {result.activity_logs_imported.toLocaleString()} activity logs imported.</p><p>{result.manual_entries_duplicate.toLocaleString()} matching manual entries and {result.activity_logs_duplicate.toLocaleString()} existing logs skipped. {metadataCount(result)} categories, rules, or devices added.</p><button type="button" className="dt-button" onClick={() => {setFile(null); edit();}}>Import another file</button></div></Section>}
    </div>;
}
