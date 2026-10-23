import type {ColumnDef} from "../types.ts";
import {IconArrowDown, IconArrowUp} from "./icons.tsx";

/** Selected column keys in order, falling back to the defaults; unknown keys are dropped. */
export function effectiveColumns(defs: ColumnDef[], custom: string[] | undefined): string[] {
    const known = new Set(defs.map((def) => def.key));
    const selected = custom ? [...new Set(custom.filter((key) => known.has(key)))] : defs.filter((def) => def.defaultOn).map((def) => def.key);
    return [...selected, ...defs.filter(def => def.required && !selected.includes(def.key)).map(def => def.key)];
}

/**
 * Checkbox list of a dataset's columns. Ticked columns come first in output order and can be
 * moved up/down; unticked ones follow in their natural order.
 */
export default function ColumnPicker({title, defs, custom, onChange, fixedOrder = false}: {
    title: string;
    defs: ColumnDef[];
    /** undefined = default columns. */
    custom: string[] | undefined;
    fixedOrder?: boolean;
    onChange: (next: string[] | undefined) => void;
}) {
    const selected = fixedOrder ? defs.map(def => def.key) : effectiveColumns(defs, custom);
    const byKey = new Map(defs.map((def) => [def.key, def]));
    const rows = [...selected.map((key) => byKey.get(key)!), ...defs.filter((def) => !selected.includes(def.key))];
    const move = (index: number, delta: number) => {
        const next = [...selected];
        const [item] = next.splice(index, 1);
        next.splice(index + delta, 0, item);
        onChange(next);
    };

    return <div className="dt-column-set">
        <header>
            <div><strong>{title}</strong><br /><span>{selected.length} of {defs.length} columns</span></div>
            <button type="button" className="dt-button dt-button-ghost" disabled={custom === undefined} onClick={() => onChange(undefined)}>Reset</button>
        </header>
        <div className="dt-column-list nice-scrollbar" role="group" aria-label={`${title} columns`}>
            {rows.map((def) => {
                const index = selected.indexOf(def.key);
                const on = index >= 0;
                return <div key={def.key} className="dt-column-row" data-on={on}>
                    <span className="dt-column-order" aria-hidden>{on ? index + 1 : ""}</span>
                    <label>
                        <input type="checkbox" checked={on} disabled={fixedOrder || def.required}
                            onChange={(event) => onChange(event.target.checked ? [...selected, def.key] : selected.filter((key) => key !== def.key))} />
                        {def.label}{def.required && <small> (required)</small>}
                    </label>
                    <button type="button" className="dt-icon-button" aria-label={`Move ${def.label} up`} disabled={fixedOrder || !on || index === 0} onClick={() => move(index, -1)}>
                        <IconArrowUp className="dt-icon-sm" />
                    </button>
                    <button type="button" className="dt-icon-button" aria-label={`Move ${def.label} down`} disabled={fixedOrder || !on || index === selected.length - 1} onClick={() => move(index, 1)}>
                        <IconArrowDown className="dt-icon-sm" />
                    </button>
                </div>;
            })}
        </div>
        {selected.length === 0 && <p className="dt-filter-hint" style={{padding: "0 12px 10px", color: "var(--tt-warning)"}}>Pick at least one column.</p>}
    </div>;
}
