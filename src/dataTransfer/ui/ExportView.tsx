import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {open, save} from "@tauri-apps/plugin-dialog";
import {join} from "@tauri-apps/api/path";
import {revealItemInDir} from "@tauri-apps/plugin-opener";
import {exportDataset, getExportFilterOptions, saveExportFile, type ExportDataset, type ExportFilterOptions, type ExportInclude} from "../../api/dataTransfer.ts";
import {getAppMetadata, setAppMetadata} from "../../api/appMetadata.ts";
import {nestManualCategories} from "../../api/ManualProject.ts";
import {useToast} from "../../Componants/Toast.tsx";
import {toErrorString} from "../../types/common.ts";
import {buildExport, columnsFor, defaultExportOptions} from "../formats/index.ts";
import {DEFAULT_INVOICE, invoiceErrors} from "../formats/export/invoice.ts";
import {pdfText} from "../formats/export/pdf/text.ts";
import type {ExportOptions} from "../types.ts";
import ColumnPickerNotice from "./ColumnPickerNotice.tsx";
import {effectiveColumns} from "./ColumnPicker.tsx";
import {Banner, Section, useDebouncedValue, useStableJson} from "./common.tsx";
import DatasetPicker from "./DatasetPicker.tsx";
import DateRangePicker from "./DateRangePicker.tsx";
import {defaultRangeSelection, resolveRange, shortRangeText, type RangeSelection} from "./dateRanges.ts";
import ExportOptionsPanel from "./ExportOptionsPanel.tsx";
import FormatPicker from "./FormatPicker.tsx";
import {IconDownload, IconEye, IconFolderOpen, IconX, Spinner} from "./icons.tsx";
import MultiSelect, {type MultiSelectOption} from "./MultiSelect.tsx";
import ExportLayout from "./ExportLayout.tsx";
import PresetBar from "./PresetBar.tsx";
import {builtInExportPresets} from "./builtInPresets.ts";
import {
    deserializePresets, deserializeSettings, LAST_SETTINGS_METADATA_KEY, PRESETS_METADATA_KEY, removePreset, sameSettings,
    serializePresets, serializeSettings, upsertPreset, type ExportPreset, type ExportSettings,
} from "./presets.ts";
import {baseName, formatBytes, onlyDataset, parseCsv, SAVE_FILTERS, sliceDataset, tablePreviewOptions} from "./preview.ts";
import PresetGrid from "./PresetGrid.tsx";
import PreviewModal, {type PreviewContent} from "./PreviewModal.tsx";
import {
    ALL_FILTERS, buildCountScope, buildScope, DATASETS, datasetCounts, everythingInclude, exportSummary,
    filterApplies, FORMAT_LABELS, FRAMEWORKS, includedKeys, LARGE_LOG_COUNT, timesheetInclude, type ExportFilters,
} from "./scope.ts";

export const EXPORT_FILTER_OPTIONS_QUERY_KEY = ["dataTransfer", "exportFilterOptions"] as const;

function defaultSettings(): ExportSettings {
    return {scopeTemplate: {range: {...defaultRangeSelection(), preset: "all_time"}, filters: ALL_FILTERS, include: timesheetInclude()}, options: defaultExportOptions()};
}

type ExportResult = {paths: string[]; bytes: number; summary: string};

function filterPickerOptions(data: ExportFilterOptions | undefined) {
    const devices: MultiSelectOption<string>[] = (data?.devices ?? []).map((device) => ({
        value: device.uuid,
        label: device.name || device.uuid.slice(0, 8),
        badge: <span className={`dt-badge${device.kind === "local" ? " dt-badge-accent" : ""}`}>{device.kind === "local" ? "This device" : "Synced"}</span>,
    }));
    const activityCategories: MultiSelectOption<string>[] = (data?.activity_categories ?? []).map((category) => ({value: category.name, label: category.name, color: category.color}));
    const manual = data?.manual_categories ?? [];
    const ids = new Set(manual.map((category) => category.id));
    const manualCategories: MultiSelectOption<number | null>[] = nestManualCategories(manual).map((category) => {
        const nested = category.parent_id != null && ids.has(category.parent_id);
        return {value: category.id, label: category.name, color: category.color, depth: nested ? 1 : 0, parent: nested ? category.parent_id : undefined};
    });
    return {devices, activityCategories, manualCategories};
}

export default function ExportView({toolbar}: {toolbar?: ReactNode} = {}) {
    const {showToast} = useToast();
    const initial = useMemo(defaultSettings, []);
    const builtIns = useMemo(builtInExportPresets, []);
    const [include, setInclude] = useState<ExportInclude>(initial.scopeTemplate.include);
    const [range, setRange] = useState<RangeSelection>(initial.scopeTemplate.range);
    const [filters, setFilters] = useState<ExportFilters>(initial.scopeTemplate.filters);
    const [options, setOptions] = useState<ExportOptions>(initial.options);
    const [presets, setPresets] = useState<ExportPreset[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const [busy, setBusy] = useState<null | "building" | "saving">(null);
    const [result, setResult] = useState<ExportResult | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [preview, setPreview] = useState<{content: PreviewContent; subtitle: string} | null>(null);
    const previewRun = useRef(0);
    const previewUrl = useRef<string | null>(null);
    useEffect(() => () => {
        previewRun.current++;
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    }, []);

    const settings: ExportSettings = useMemo(() => ({scopeTemplate: {range, filters, include}, options}), [range, filters, include, options]);
    const applySettings = useCallback((next: ExportSettings) => {
        setInclude(next.scopeTemplate.include);
        setRange(next.scopeTemplate.range);
        setFilters(next.scopeTemplate.filters);
        setOptions(next.options);
    }, []);

    // Restore last-used settings and presets once.
    useEffect(() => {
        let active = true;
        Promise.all([getAppMetadata(LAST_SETTINGS_METADATA_KEY), getAppMetadata(PRESETS_METADATA_KEY)])
            .then(([last, saved]) => {
                if (!active) return;
                const restored = deserializeSettings(last, initial);
                if (restored) applySettings(restored);
                setPresets(deserializePresets(saved, initial));
            })
            .catch(() => {/* First run or metadata unavailable: keep defaults. */})
            .finally(() => {if (active) setHydrated(true);});
        return () => {active = false;};
    }, [initial, applySettings]);

    // Remember the last-used settings.
    const settingsJson = serializeSettings(settings);
    useEffect(() => {
        if (!hydrated) return;
        const timer = setTimeout(() => {void setAppMetadata(LAST_SETTINGS_METADATA_KEY, settingsJson).catch(() => undefined);}, 800);
        return () => clearTimeout(timer);
    }, [settingsJson, hydrated]);

    const filterOptions = useQuery({queryKey: EXPORT_FILTER_OPTIONS_QUERY_KEY, queryFn: getExportFilterOptions});
    const pickers = useMemo(() => filterPickerOptions(filterOptions.data), [filterOptions.data]);
    const bounds = {data_start: filterOptions.data?.data_start ?? null, data_end: filterOptions.data?.data_end ?? null};
    const resolved = useStableJson(resolveRange(range, new Date(), bounds));
    const rangeText = resolved ? shortRangeText(resolved) : null;
    const scope = resolved ? buildScope(resolved, include, filters, filterOptions.data) : null;

    const countScope = useStableJson(resolved && filterOptions.data ? buildCountScope(resolved, include, filters, filterOptions.data) : null);
    const debouncedCountScope = useDebouncedValue(countScope, 300);
    const counts = useQuery({
        queryKey: ["dataTransfer", "exportCounts", debouncedCountScope],
        queryFn: () => exportDataset(debouncedCountScope!),
        enabled: debouncedCountScope != null,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });
    const countMap = datasetCounts(counts.data);
    const countsLoading = counts.isFetching || countScope !== debouncedCountScope;

    const savedMatch = presets.find(preset => sameSettings(preset, settings));
    const builtInMatch = builtIns.find(preset => sameSettings(preset, settings));
    const activePreset = savedMatch ? `saved:${savedMatch.name}` : builtInMatch ? `builtin:${builtInMatch.name}` : null;
    const selectedKeys = includedKeys(include);
    const tabular = options.format === "csv" || options.format === "xlsx";
    const patchOptions = (patch: Partial<ExportOptions>) => setOptions((current) => ({...current, ...patch}));

    const blockers: string[] = [];
    if (options.format === "pdf" && options.pdf.layout === "invoice") {
        if (!include.manual_entries || selectedKeys.some(key => key !== "manual_entries")) blockers.push("Hourly invoices use manual time entries only.");
        if (filters.manualCategories?.length === 0) blockers.push("Choose at least one manual category, or select all.");
        blockers.push(...invoiceErrors({...DEFAULT_INVOICE, ...options.pdf.invoice}));
    }
    if (!filterOptions.data) blockers.push(filterOptions.error ? "Load filter options successfully before exporting." : "Loading available data…");
    if (!selectedKeys.length) blockers.push("Choose at least one thing to export.");
    if (!resolved) blockers.push("Fix the date range.");
    if (tabular) {
        for (const key of selectedKeys) {
            const defs = columnsFor(key, options.framework);
            if (defs.length && effectiveColumns(defs, options.columns[key]).length === 0) blockers.push(`Pick at least one column for ${DATASETS.find((item) => item.key === key)!.label}.`);
        }
    }
    const framework = FRAMEWORKS.find((item) => item.id === options.framework)!;
    const userMissing = tabular && framework.needsUser && include.manual_entries && !(framework.id === "harvest" ? options.userName.trim() : options.userEmail.trim());
    if (tabular && framework.needsUser && include.manual_entries) {
        if (framework.id === "harvest") {
            if (options.userName.trim().split(/\s+/).length < 2) blockers.push("Add your first and last name for the Harvest import.");
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.userEmail.trim())) {
            blockers.push(`Add a valid email so ${framework.label} can match entries to you.`);
        }
    }
    const logCount = include.activity_logs ? countMap.activity_logs : undefined;
    const summary = exportSummary(include, countMap, rangeText, options.format);
    const unsupportedPdfText = useMemo(() => {
        if (options.format !== "pdf" || !counts.data) return false;
        const unsupported = (value: unknown): boolean => {
            if (typeof value === "string") return (pdfText(value).match(/\?/g)?.length ?? 0) > (value.match(/\?/g)?.length ?? 0);
            if (Array.isArray(value)) return value.some(unsupported);
            if (value && typeof value === "object") return Object.values(value).some(unsupported);
            return false;
        };
        return includedKeys(include).some(key => unsupported(counts.data![key]));
    }, [options.format, counts.data, include]);

    const savePresets = async (next: ExportPreset[]) => {
        setPresets(next);
        try {
            await setAppMetadata(PRESETS_METADATA_KEY, serializePresets(next));
            return true;
        } catch (error) {
            setPresets(presets);
            showToast("Could not save presets", "error", 5000, toErrorString(error));
            return false;
        }
    };

    const runExport = async () => {
        if (!scope || blockers.length) return;
        setResult(null);
        setExportError(null);
        setBusy("building");
        try {
            const dataset = await exportDataset(scope);
            const files = await buildExport(dataset, normalizedOptions());
            if (!files.length) throw new Error("Nothing was produced for this selection.");
            let paths: string[];
            if (files.length === 1) {
                const path = await save({title: "Save export", defaultPath: files[0].fileName, filters: [SAVE_FILTERS[options.format]]});
                if (!path) return;
                setBusy("saving");
                await saveExportFile(path, files[0].bytes);
                paths = [path];
            } else {
                const dir = await open({title: `Choose a folder for ${files.length} files`, directory: true, multiple: false});
                if (!dir || Array.isArray(dir)) return;
                setBusy("saving");
                paths = [];
                for (const file of files) {
                    const path = await join(dir, file.fileName);
                    await saveExportFile(path, file.bytes);
                    paths.push(path);
                }
            }
            const bytes = files.reduce((total, file) => total + file.bytes.length, 0);
            setResult({paths, bytes, summary});
            showToast(paths.length === 1 ? `Exported ${baseName(paths[0])}` : `Exported ${paths.length} files`, "success");
        } catch (error) {
            setExportError(toErrorString(error));
            showToast("Export failed", "error", 5000, toErrorString(error));
        } finally {
            setBusy(null);
        }
    };

    const normalizedOptions = (): ExportOptions => {
        const columns = {...options.columns};
        for (const key of selectedKeys) {
            const defs = columnsFor(key, options.framework);
            columns[key] = key === "manual_entries" && options.framework === "harvest"
                ? defs.map(def => def.key) : effectiveColumns(defs, columns[key]);
        }
        return {...options, columns};
    };

    const closePreview = useCallback(() => {
        previewRun.current++;
        previewUrl.current = null;
        setPreview((current) => {
            if (current?.content.kind === "pdf") URL.revokeObjectURL(current.content.url);
            return null;
        });
    }, []);

    const runPreview = async () => {
        if (!scope || blockers.length) return;
        const run = ++previewRun.current;
        const subtitle = summary;
        setPreview({content: {kind: "loading"}, subtitle});
        const show = (content: PreviewContent) => {
            if (previewRun.current === run) {
                if (content.kind === "pdf") previewUrl.current = content.url;
                setPreview({content, subtitle});
            }
            else if (content.kind === "pdf") URL.revokeObjectURL(content.url);
        };
        try {
            // The count query already loaded this data, so reuse it instead of querying again.
            const cached = counts.data && !counts.isFetching && countScope === debouncedCountScope ? counts.data : null;
            const dataset = cached
                ? {...cached, ...Object.fromEntries(DATASETS.filter(item => !include[item.key]).map(item => [item.key, []]))} as ExportDataset
                : await exportDataset(scope);
            if (options.format === "pdf") {
                const [file] = await buildExport(dataset, normalizedOptions());
                show({kind: "pdf", url: URL.createObjectURL(new Blob([file.bytes as BlobPart], {type: "application/pdf"}))});
            } else if (options.format === "json") {
                const [file] = await buildExport(sliceDataset(dataset, 5), options);
                const text = new TextDecoder().decode(file.bytes);
                show({kind: "tables", tables: [{title: "Backup structure (first 5 items per section)", headers: ["JSON"], rows: text.split("\n").slice(0, 400).map((line) => [line])}], totals: [0]});
            } else {
                const previewOptions = tablePreviewOptions(normalizedOptions());
                const tables = [];
                const totals = [];
                for (const key of selectedKeys) {
                    const meta = DATASETS.find((item) => item.key === key)!;
                    const [file] = await buildExport(onlyDataset(dataset, key), previewOptions);
                    const defs = columnsFor(key, options.framework);
                    const fallbackHeaders = effectiveColumns(defs, options.columns[key]).map((column) => defs.find((def) => def.key === column)?.label ?? column);
                    const [headers = fallbackHeaders, ...rows] = file ? parseCsv(new TextDecoder().decode(file.bytes)) : [];
                    tables.push({title: meta.label, headers, rows: rows.slice(0, 20)});
                    totals.push(dataset[key].length);
                }
                show({kind: "tables", tables, totals});
            }
        } catch (error) {
            show({kind: "error", message: toErrorString(error)});
        }
    };

    const filterHint = (applies: boolean, appliesTo: string) => applies ? null : `Only used for ${appliesTo}, which aren't selected.`;
    const devicesApply = filterApplies("devices", include);
    const manualApply = filterApplies("manualCategories", include);

    const presetControls = ({goCustom}: {goCustom: () => void}) => <PresetBar onCustom={goCustom} presets={presets} builtIns={builtIns} active={activePreset}
            onApply={(preset) => applySettings({scopeTemplate: structuredClone(preset.scopeTemplate), options: structuredClone(preset.options)})}
            onSave={async (name) => {
                if (await savePresets(upsertPreset(presets, {name, ...structuredClone(settings)}))) showToast(`Saved preset “${name}”`, "success");
            }}
            onDelete={(name) => void savePresets(removePreset(presets, name))} />;

    const dataControls = <Section id="dt-export-what" step={1} title="What to export" description="Pick one or more datasets. Counts update with your range and filters.">
            <DatasetPicker include={include} counts={countMap} loading={countsLoading} onChange={setInclude} />
            {counts.error && <Banner tone="danger" role="alert">Could not count data: {toErrorString(counts.error)}</Banner>}
            {logCount != null && logCount > LARGE_LOG_COUNT && <Banner tone="warning">
                <strong>{logCount.toLocaleString("en-US")} raw activity logs.</strong> Large exports take longer and{options.format === "pdf" ? " make very long PDFs" : " produce big files"}. Consider a shorter range or Activity sessions instead.
            </Banner>}
        </Section>;

    const rangeControls = <Section id="dt-export-range" step={2} title="Date range"
            description="Entries, sessions and logs are selected by start time. Settings-like data (devices, categories, rules) isn't date-bound.">
            <DateRangePicker value={range} resolved={resolved} onChange={setRange} />
        </Section>;

    const filtersControls = <Section id="dt-export-filters" step={3} title="Filters" description="Leave everything selected to export all. New devices and categories are included automatically.">
            {filterOptions.error && <Banner tone="danger" role="alert">Could not load filter options: {toErrorString(filterOptions.error)}</Banner>}
            <div className="dt-filter-grid">
                <MultiSelect label="Devices" noun="devices" options={pickers.devices} selected={filters.devices}
                    onChange={(devices) => setFilters({...filters, devices})} disabled={!devicesApply}
                    hint={filterHint(devicesApply, "activity sessions and logs")} />
                <MultiSelect label="Activity categories" noun="categories" options={pickers.activityCategories} selected={filters.activityCategories}
                    onChange={(activityCategories) => setFilters({...filters, activityCategories})} disabled={!devicesApply}
                    hint={filterHint(devicesApply, "activity sessions and logs")} />
                <MultiSelect label="Manual categories" noun="manual categories" options={pickers.manualCategories} selected={filters.manualCategories}
                    onChange={(manualCategories) => setFilters({...filters, manualCategories})} disabled={!manualApply}
                    hint={filterHint(manualApply, "manual time entries") ?? "Selecting a category also selects its subcategories."} />
            </div>
        </Section>;

    const formatControls = <Section id="dt-export-format" step={4} title="Format">
            <FormatPicker options={options} manualSelected={include.manual_entries} onChange={patchOptions} />
            {unsupportedPdfText && <Banner tone="warning">Some selected text uses characters this PDF font cannot display. Those characters become “?”. Choose Excel, CSV, or JSON to preserve the original text.</Banner>}
            {options.format === "pdf" && include.activity_logs && <Banner tone="info">PDFs show up to 5,000 raw activity log rows. Totals include all selected logs. Use CSV, Excel, or JSON for every raw record.</Banner>}
            {options.format === "json" && selectedKeys.length < DATASETS.length && <ColumnPickerNotice onSelectAll={() => setInclude(everythingInclude())} />}
        </Section>;

    const optionsControls = <Section id="dt-export-options" step={5} title="Options" description={options.format === "json" ? undefined : `Settings for the ${FORMAT_LABELS[options.format]} file.`}>
            <ExportOptionsPanel options={options} include={include} columnsFor={columnsFor} onChange={patchOptions} />
        </Section>;

    const footerControls = <div className="dt-footer">
            <div className="dt-footer-inner">
                <div className="dt-footer-summary" aria-live="polite">
                    {busy ? <Spinner /> : <IconDownload className="dt-icon" />}
                    <div>
                        {busy === "building" ? "Preparing export…" : busy === "saving" ? "Saving…" : summary}
                        {!busy && (blockers[0] || userMissing) && <small style={{color: blockers.length ? "var(--tt-danger)" : "var(--tt-warning)"}}>
                            {blockers[0] ?? `Add your ${framework.id === "harvest" ? "name" : "email"} so ${framework.label} can match the entries to you.`}
                        </small>}
                    </div>
                </div>
                <div className="dt-footer-actions">
                    <button type="button" className="dt-button dt-button-lg" disabled={!!busy || blockers.length > 0} onClick={() => void runPreview()}>
                        <IconEye className="dt-icon-sm" /> Preview
                    </button>
                    <button type="button" className="dt-button dt-button-primary dt-button-lg" disabled={!!busy || blockers.length > 0} onClick={() => void runExport()}>
                        {busy ? <Spinner /> : <IconDownload className="dt-icon-sm" />} Export
                    </button>
                </div>
            </div>
            {(result || exportError) && <div style={{marginTop: 10}}>
                {result && <Banner tone="success" role="status">
                    <div className="dt-actions">
                        <span><strong>Export complete.</strong> {result.summary} — {result.paths.length === 1 ? baseName(result.paths[0]) : `${result.paths.length} files`} ({formatBytes(result.bytes)}).</span>
                        <div>
                            <button type="button" className="dt-button" onClick={() => {
                                void revealItemInDir(result.paths.length === 1 ? result.paths[0] : result.paths).catch((error) => showToast("Could not open the folder", "error", 5000, toErrorString(error)));
                            }}><IconFolderOpen className="dt-icon-sm" /> Show in folder</button>
                            <button type="button" className="dt-icon-button" aria-label="Dismiss" onClick={() => setResult(null)}><IconX className="dt-icon-sm" /></button>
                        </div>
                    </div>
                </Banner>}
                {exportError && <Banner tone="danger" role="alert">
                    <div className="dt-actions">
                        <span><strong>Export failed.</strong> {exportError}</span>
                        <button type="button" className="dt-icon-button" aria-label="Dismiss" onClick={() => setExportError(null)}><IconX className="dt-icon-sm" /></button>
                    </div>
                </Banner>}
            </div>}
        </div>;

    return <div className="dt-root">
        <ExportLayout toolbar={toolbar} presetActive={activePreset != null} onResetScope={() => {setRange({...defaultRangeSelection(), preset: "all_time"}); setFilters(ALL_FILTERS);}} slots={{preset: presetControls, presetGrid: ({advance, custom, setCustom}) => <PresetGrid presets={presets} builtIns={builtIns} active={activePreset} custom={custom}
            onPick={(preset) => {setCustom(false); applySettings({scopeTemplate: structuredClone(preset.scopeTemplate), options: structuredClone(preset.options)}); advance();}}
            onCustom={() => setCustom(true)} />, data: dataControls, range: rangeControls, filters: filtersControls, format: formatControls, options: optionsControls, footer: footerControls}}
            overview={{summary, scopeSummary: `${range.preset === "all_time" ? "All time" : rangeText ?? "Invalid dates"} / ${Object.values(filters).every(value => value === null) ? "All devices & categories" : "Custom filters"}`, format: FORMAT_LABELS[options.format], range: rangeText, datasets: selectedKeys.map(key => ({label: DATASETS.find(item => item.key === key)!.label, count: countMap[key]})), blocker: blockers[0]}} />

        {preview && <PreviewModal title={`Preview · ${FORMAT_LABELS[options.format]}`} subtitle={preview.subtitle} content={preview.content} onClose={closePreview} />}
    </div>;
}
