import {DEFAULT_INVOICE, INVOICE_CURRENCIES} from "../formats/export/invoice.ts";
import type {ExportInclude} from "../../api/dataTransfer.ts";
import type {ExportOptions} from "../types.ts";
import {RANGE_PRESET_IDS, type RangeSelection} from "./dateRanges.ts";
import {DATASET_KEYS, type ExportFilters} from "./scope.ts";

/*
 * Saved export presets and the remembered last-used settings, stored as JSON in app metadata.
 * Presets keep the range *preset* (e.g. "last_month"), never resolved timestamps,
 * so "Monthly invoice" always means the month before the day it is used.
 */

export const PRESETS_METADATA_KEY = "data_export_presets_v1";
export const LAST_SETTINGS_METADATA_KEY = "data_export_last_v1";

export type ScopeTemplate = {range: RangeSelection; filters: ExportFilters; include: ExportInclude};

export type ExportSettings = {scopeTemplate: ScopeTemplate; options: ExportOptions};

export type ExportPreset = ExportSettings & {name: string};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseRange(value: unknown, fallback: RangeSelection): RangeSelection {
    if (!isRecord(value)) return fallback;
    const preset = RANGE_PRESET_IDS.includes(value.preset as RangeSelection["preset"]) ? value.preset as RangeSelection["preset"] : fallback.preset;
    return {
        preset,
        customStart: typeof value.customStart === "string" ? value.customStart : fallback.customStart,
        customEnd: typeof value.customEnd === "string" ? value.customEnd : fallback.customEnd,
    };
}

function parseStringList(value: unknown): string[] | null {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

function parseFilters(value: unknown): ExportFilters {
    if (!isRecord(value)) return {devices: null, activityCategories: null, manualCategories: null};
    return {
        devices: parseStringList(value.devices),
        activityCategories: parseStringList(value.activityCategories),
        manualCategories: Array.isArray(value.manualCategories)
            ? value.manualCategories.filter((item): item is number | null => item === null || (typeof item === "number" && Number.isSafeInteger(item) && item > 0))
            : null,
    };
}

function parseInclude(value: unknown, fallback: ExportInclude): ExportInclude {
    const include = {...fallback};
    if (!isRecord(value)) return include;
    for (const key of DATASET_KEYS) if (typeof value[key] === "boolean") include[key] = value[key] as boolean;
    return include;
}

const OPTION_VALUES = {
    format: ["csv", "xlsx", "pdf", "json"],
    framework: ["native", "clockify", "toggl", "harvest"],
    durationFormat: ["hms", "hm", "decimal"],
    timeFormat: ["24h", "12h"],
    dateFormat: ["iso", "us", "eu"],
    csvDelimiter: [",", ";", "\t"],
    rounding: [0, 1, 5, 6, 10, 15, 30, 60],
    roundingMode: ["nearest", "up", "down"],
    summaryGrouping: ["none", "day", "week", "category", "device"],
} as const;

/** Overlays only recognised enum values and correctly typed fields, so corrupted saved settings cannot break selectors or formatters. */
export function mergeOptions(defaults: ExportOptions, stored: unknown): ExportOptions {
    if (!isRecord(stored)) return structuredClone(defaults);
    const result = structuredClone(defaults);
    const target = result as unknown as Record<string, unknown>;
    for (const [key, values] of Object.entries(OPTION_VALUES)) {
        if ((values as readonly unknown[]).includes(stored[key])) target[key] = stored[key];
    }
    if (typeof stored.csvBom === "boolean") result.csvBom = stored.csvBom;
    for (const key of ["userName", "userEmail"] as const) if (typeof stored[key] === "string") result[key] = stored[key];
    if (isRecord(stored.columns)) {
        for (const key of DATASET_KEYS) {
            const columns = parseStringList(stored.columns[key]);
            if (columns) result.columns[key] = columns;
        }
    }
    if (isRecord(stored.pdf)) {
        if (stored.pdf.layout === "report" || stored.pdf.layout === "invoice") result.pdf.layout = stored.pdf.layout;
        if (isRecord(stored.pdf.invoice)) {
            const invoice = {...DEFAULT_INVOICE};
            for (const key of Object.keys(invoice) as (keyof typeof invoice)[]) {
                const value = stored.pdf.invoice[key];
                if (typeof value === "string" && key !== "currency") invoice[key] = value;
            }
            if (INVOICE_CURRENCIES.includes(stored.pdf.invoice.currency as typeof invoice.currency)) invoice.currency = stored.pdf.invoice.currency as typeof invoice.currency;
            result.pdf.invoice = invoice;
        }
        const pdf = result.pdf as unknown as Record<string, unknown>;
        for (const key of ["title", "preparedBy", "preparedFor"] as const) if (typeof stored.pdf[key] === "string") pdf[key] = stored.pdf[key];
        if (["portrait", "landscape"].includes(stored.pdf.orientation as string)) pdf.orientation = stored.pdf.orientation;
        if (["a4", "letter"].includes(stored.pdf.pageSize as string)) pdf.pageSize = stored.pdf.pageSize;
        const accent = stored.pdf.accentColor;
        if (typeof accent === "string" && /^#[0-9a-f]{6}$/i.test(accent)) pdf.accentColor = accent;
        if (isRecord(stored.pdf.sections)) {
            const sections = result.pdf.sections as unknown as Record<string, unknown>;
            for (const key of Object.keys(defaults.pdf.sections)) {
                if (typeof stored.pdf.sections[key] === "boolean") sections[key] = stored.pdf.sections[key];
            }
        }
    }
    return result;
}

export function parseSettings(value: unknown, defaults: ExportSettings): ExportSettings | null {
    if (!isRecord(value) || !isRecord(value.scopeTemplate)) return null;
    const template = value.scopeTemplate;
    return {
        scopeTemplate: {
            range: parseRange(template.range, defaults.scopeTemplate.range),
            filters: parseFilters(template.filters),
            include: parseInclude(template.include, defaults.scopeTemplate.include),
        },
        options: mergeOptions(defaults.options, value.options),
    };
}

export function serializeSettings(settings: ExportSettings): string {
    return JSON.stringify(settings);
}

export function deserializeSettings(json: string | null, defaults: ExportSettings): ExportSettings | null {
    if (!json) return null;
    try {
        return parseSettings(JSON.parse(json), defaults);
    } catch {
        return null;
    }
}

export function serializePresets(presets: ExportPreset[]): string {
    return JSON.stringify(presets.map(({name, scopeTemplate, options}) => ({name, scopeTemplate, options})));
}

/** Parses stored presets, skipping malformed entries; names are trimmed and unique. */
export function deserializePresets(json: string | null, defaults: ExportSettings): ExportPreset[] {
    if (!json) return [];
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const presets: ExportPreset[] = [];
    for (const item of raw) {
        if (!isRecord(item) || typeof item.name !== "string") continue;
        const name = item.name.trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        const settings = parseSettings(item, defaults);
        if (!settings) continue;
        seen.add(name.toLowerCase());
        presets.push({name, ...settings});
    }
    return presets;
}

/** Adds or replaces (case-insensitive name match) a preset, keeping presets sorted by name. */
export function upsertPreset(presets: ExportPreset[], preset: ExportPreset): ExportPreset[] {
    const name = preset.name.trim();
    const rest = presets.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
    return [...rest, {...preset, name}].sort((a, b) => a.name.localeCompare(b.name));
}

export function removePreset(presets: ExportPreset[], name: string): ExportPreset[] {
    return presets.filter((item) => item.name !== name);
}

/** JSON with object keys sorted, so equal settings compare equal regardless of key order. */
export function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, item: unknown) => isRecord(item)
        ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
        : item);
}

export function sameSettings(a: ExportSettings, b: ExportSettings): boolean {
    return stableStringify({scopeTemplate: a.scopeTemplate, options: a.options}) === stableStringify({scopeTemplate: b.scopeTemplate, options: b.options});
}
