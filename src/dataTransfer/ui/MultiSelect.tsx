import {useEffect, useId, useMemo, useRef, useState, type ReactNode} from "react";
import {IconChevronDown, IconSearch} from "./icons.tsx";
import {selectionSummary} from "./scope.ts";

export type MultiSelectOption<T> = {
    value: T;
    label: string;
    /** 1 = indented under `parent`. */
    depth?: 0 | 1;
    parent?: T;
    color?: string | null;
    badge?: ReactNode;
};

/**
 * Searchable checkbox dropdown. `selected === null` means "all" (and stays null whenever every
 * option is ticked), so new options added later are included automatically.
 * Ticking a parent ticks or unticks its indented children too.
 */
export default function MultiSelect<T extends string | number | null>({label, noun, options, selected, onChange, disabled, hint}: {
    label: string;
    noun: string;
    options: MultiSelectOption<T>[];
    selected: T[] | null;
    onChange: (next: T[] | null) => void;
    disabled?: boolean;
    hint?: ReactNode;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const allValues = useMemo(() => options.map((option) => option.value), [options]);
    const chosen = useMemo(() => new Set<T>(selected ?? allValues), [selected, allValues]);
    const childrenOf = (value: T) => options.filter((option) => option.depth === 1 && option.parent === value).map((option) => option.value);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return options;
        const matches = (option: MultiSelectOption<T>) => option.label.toLowerCase().includes(needle);
        const parentMatches = new Set(options.filter((option) => option.depth !== 1 && matches(option)).map((option) => option.value));
        return options.filter((option) => matches(option) || (option.depth === 1 && parentMatches.has(option.parent as T)));
    }, [options, query]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        searchRef.current?.focus();
        return () => document.removeEventListener("mousedown", onPointer);
    }, [open]);

    const commit = (next: Set<T>) => {
        if (allValues.every((value) => next.has(value))) onChange(null);
        else onChange(allValues.filter((value) => next.has(value)));
    };

    const toggle = (value: T, on: boolean) => {
        const next = new Set(chosen);
        for (const item of [value, ...childrenOf(value)]) {
            if (on) next.add(item);
            else next.delete(item);
        }
        commit(next);
    };

    const setVisible = (on: boolean) => {
        const next = new Set(chosen);
        for (const option of visible) {
            if (on) next.add(option.value);
            else next.delete(option.value);
        }
        commit(next);
    };

    const count = selected == null ? options.length : selected.length;
    const summary = options.length === 0 ? `No ${noun}` : selectionSummary(selected, options.length, noun);

    return <div className="dt-filter" data-disabled={disabled || undefined}>
        <span className="dt-field-label" id={`${id}-label`}>{label}</span>
        <div className="dt-ms" ref={rootRef} style={{marginTop: 6}}
            onKeyDown={(event) => {
                if (event.key === "Escape" && open) {
                    event.stopPropagation();
                    setOpen(false);
                    triggerRef.current?.focus();
                }
            }}>
            <button ref={triggerRef} type="button" className="dt-ms-trigger" aria-haspopup="dialog" aria-expanded={open}
                aria-labelledby={`${id}-label ${id}-value`} disabled={disabled || options.length === 0}
                onClick={() => setOpen((value) => !value)}>
                <span id={`${id}-value`}>{summary}</span>
                <IconChevronDown className="dt-icon-sm" />
            </button>
            {open && <div className="dt-ms-panel" role="dialog" aria-label={`Choose ${noun}`}>
                <label className="dt-ms-search">
                    <IconSearch className="dt-icon-sm" />
                    <input ref={searchRef} type="search" value={query} placeholder={`Search ${noun}`} aria-label={`Search ${noun}`}
                        onChange={(event) => setQuery(event.target.value)} />
                </label>
                <div className="dt-ms-tools">
                    <span aria-live="polite">{count} of {options.length} selected</span>
                    <span>
                        <button type="button" onClick={() => setVisible(true)}>{query ? "Select shown" : "Select all"}</button>
                        <button type="button" onClick={() => setVisible(false)}>{query ? "Clear shown" : "Select none"}</button>
                    </span>
                </div>
                <div className="dt-ms-list nice-scrollbar" role="group" aria-label={label}>
                    {visible.length === 0 && <div className="dt-ms-empty">No {noun} match “{query}”.</div>}
                    {visible.map((option) => {
                        const children = option.depth === 1 ? [] : childrenOf(option.value);
                        const checked = chosen.has(option.value);
                        const mixed = children.some((child) => chosen.has(child) !== checked);
                        return <label key={String(option.value)} className="dt-ms-option" data-depth={option.depth ?? 0}
                            title={children.length ? "Also selects its subcategories" : undefined}>
                            <input type="checkbox" checked={checked} ref={(element) => {if (element) element.indeterminate = mixed;}}
                                onChange={(event) => toggle(option.value, event.target.checked)} />
                            {option.color !== undefined && <span className="dt-dot" style={option.color ? {background: option.color} : undefined} aria-hidden />}
                            <span className="dt-ms-label">{option.label}</span>
                            {option.badge}
                        </label>;
                    })}
                </div>
            </div>}
        </div>
        {hint && <p className="dt-filter-hint">{hint}</p>}
    </div>;
}
