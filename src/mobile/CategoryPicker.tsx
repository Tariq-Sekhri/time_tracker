import {useRef, useState} from "react";
import ManualPopover from "../Componants/ManualPopover";

type Category = {name: string; color: string};
const separator = " \u203a ";
const uncategorizedColor = "#64748b";

const Chevron = ({open}: {open: boolean}) => <svg className={`chevron ${open ? "open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
const Plus = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;

export default function CategoryPicker({categories, value, onChange, onCreate, disabled = false}: {
    categories: Category[];
    value: string;
    onChange: (name: string) => void;
    onCreate: (name: string, parent: string | null) => Promise<string | null>;
    disabled?: boolean;
}) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState<{parent: string | null} | null>(null);
    const [createName, setCreateName] = useState("");
    const [saving, setSaving] = useState(false);
    const names = new Set(categories.map(item => item.name));
    const parentOf = (name: string) => { const index = name.indexOf(separator); return index > 0 && names.has(name.slice(0, index)) ? name.slice(0, index) : null; };
    const labelOf = (name: string) => { const parent = parentOf(name); return parent ? name.slice(parent.length + separator.length) : name; };
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    const childrenOf = (parent: string) => sorted.filter(item => parentOf(item.name) === parent);
    const selected = categories.find(item => item.name === value);
    const selectedParent = selected ? parentOf(selected.name) : null;
    const search = query.trim().toLowerCase();
    const matches = (name: string) => labelOf(name).toLowerCase().includes(search);
    const groups = sorted.filter(item => !parentOf(item.name)).flatMap(parent => {
        const children = childrenOf(parent.name);
        const matchingChildren = search ? children.filter(item => matches(item.name)) : [];
        if (search && !matches(parent.name) && !matchingChildren.length) return [];
        const visible = expanded.has(parent.name) && (!search || matches(parent.name)) ? children : matchingChildren;
        return [{parent, childCount: children.length, children: visible}];
    });
    const showUncategorized = !search || "uncategorized".includes(search);
    const options = [...(showUncategorized ? [""] : []), ...groups.flatMap(group => [group.parent.name, ...group.children.map(item => item.name)])];
    const expand = (name: string) => setExpanded(current => new Set(current).add(name));
    const toggle = (name: string) => setExpanded(current => {
        const next = new Set(current);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
    });
    const close = () => { setOpen(false); setQuery(""); setCreating(null); };
    const openPicker = () => { if (selectedParent) expand(selectedParent); setOpen(true); };
    const pick = (name: string) => {
        onChange(name);
        if (name && childrenOf(name).length && !(value === name && expanded.has(name))) { expand(name); return; }
        close();
    };
    const startCreating = (parent: string | null) => {
        setCreating({parent});
        setCreateName(parent == null ? query.trim() : "");
        if (parent) expand(parent);
    };
    const submit = async (parent: string | null) => {
        if (!createName.trim() || saving) return;
        setSaving(true);
        const saved = await onCreate(createName.trim(), parent);
        setSaving(false);
        if (saved) { onChange(saved); close(); }
    };
    const createForm = (parent: string | null) => <form className={`picker-form ${parent ? "child" : ""}`} onSubmit={event => { event.preventDefault(); void submit(parent); }}>
        <input autoFocus aria-label={parent ? "New subcategory name" : "New category name"} value={createName} onChange={event => setCreateName(event.target.value)} maxLength={100} placeholder={parent ? "Subcategory name" : "Category name"} disabled={saving} />
        <button type="submit" className="primary" disabled={saving || !createName.trim()}>Add</button>
    </form>;

    return <>
        <button ref={triggerRef} type="button" className="category-trigger" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => open ? close() : openPicker()}>
            <span className="dot" style={{background: selected?.color ?? uncategorizedColor}} />
            <span className="picker-label">{selected ? <>{selectedParent && <span className="muted-text">{selectedParent}{separator}</span>}{labelOf(selected.name)}</> : <span className="muted-text">Uncategorized</span>}</span>
            <Chevron open={open} />
        </button>
        {open && <ManualPopover anchor={triggerRef.current} onClose={close} labelledBy="category-picker-search" width={triggerRef.current?.offsetWidth ?? 340}>
            <div className="category-picker">
                <div className="picker-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                    <input id="category-picker-search" type="search" aria-label="Search categories" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        if (options.length) pick(options[0]);
                        else if (search) startCreating(null);
                    }} placeholder="Search category or subcategory" />
                </div>
                <div role="listbox" aria-label="Categories" className="picker-list">
                    {showUncategorized && <button type="button" role="option" aria-selected={value === ""} className="picker-option" onClick={() => pick("")}>
                        <span className="dot" style={{background: uncategorizedColor}} /><span className="picker-label">Uncategorized</span>
                    </button>}
                    {groups.map(({parent, childCount, children}) => {
                        const isOpen = expanded.has(parent.name);
                        return <div key={parent.name} className="picker-group">
                            <div className="picker-row">
                                <button type="button" role="option" aria-selected={value === parent.name} className="picker-option" onClick={() => pick(parent.name)}>
                                    <span className="dot" style={{background: parent.color}} /><span className="picker-label">{parent.name}</span>
                                </button>
                                {childCount > 0
                                    ? <button type="button" className="picker-chip" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} ${parent.name} subcategories`} onClick={() => toggle(parent.name)}>{childCount} {childCount === 1 ? "sub" : "subs"} <Chevron open={isOpen} /></button>
                                    : <button type="button" className="picker-chip add" aria-label={`Add subcategory to ${parent.name}`} onClick={() => startCreating(parent.name)}><Plus /> Sub</button>}
                            </div>
                            {children.map(child => <button key={child.name} type="button" role="option" aria-selected={value === child.name} className="picker-option child" onClick={() => pick(child.name)}>
                                <span className="picker-label">{labelOf(child.name)}</span>
                            </button>)}
                            {creating?.parent === parent.name
                                ? createForm(parent.name)
                                : isOpen && children.length > 0 && <button type="button" className="picker-add child" onClick={() => startCreating(parent.name)}><Plus /> Add subcategory</button>}
                        </div>;
                    })}
                    {!options.length && <p className="empty">No categories match “{query.trim()}”.</p>}
                </div>
                <div className="picker-footer">
                    {creating?.parent === null ? createForm(null) : <button type="button" className="picker-add" onClick={() => startCreating(null)}>
                        <span className="plus-ring"><Plus /></span>
                        {search && !names.has(query.trim()) ? <>Create category “{query.trim()}”</> : "Create new category"}
                    </button>}
                </div>
            </div>
        </ManualPopover>}
    </>;
}
