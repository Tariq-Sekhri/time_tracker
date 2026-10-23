import {useEffect, useMemo, useRef, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createManualProject, deleteManualProject, getManualProjects, MANUAL_PROJECTS_QUERY_KEY, getManualCategories, MANUAL_CATEGORIES_QUERY_KEY, manualCategoryLabel, nestManualCategories, updateManualProject, type ManualProject} from "../api/ManualProject.ts";
import ManualPopover from "./ManualPopover.tsx";

type ProjectAction = {type: "create"; name: string; parentId: number | null} | {type: "edit"; id: number; name: string} | {type: "delete"; id: number};

const Chevron = ({open}: {open: boolean}) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>;
const Plus = ({size = 14}: {size?: number}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;

export default function ProjectSelector({value, onChange, disabled = false}: {
    value: number | null;
    onChange: (id: number | null) => void;
    disabled?: boolean;
}) {
    const queryClient = useQueryClient();
    const {data: rawProjects = [], isLoading, error: loadError} = useQuery({queryKey: MANUAL_PROJECTS_QUERY_KEY, queryFn: getManualProjects});
    const {data: categories = []} = useQuery({queryKey: MANUAL_CATEGORIES_QUERY_KEY, queryFn: getManualCategories});
    const projects = useMemo(() => nestManualCategories(rawProjects), [rawProjects]);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const manageRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [creating, setCreating] = useState<{parentId: number | null} | null>(null);
    const [createName, setCreateName] = useState("");
    const [active, setActive] = useState(0);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [editId, setEditId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!isLoading && !loadError && value != null && !projects.some((project) => project.id === value)) onChange(null);
    }, [isLoading, loadError, projects, value, onChange]);
    const mutation = useMutation({
        mutationFn: async (action: ProjectAction) => {
            if (action.type === "create") return createManualProject(action.name.trim(), action.parentId);
            if (action.type === "edit") return updateManualProject(action.id, action.name.trim());
            return deleteManualProject(action.id);
        },
        onSuccess: async (id, action) => {
            await queryClient.invalidateQueries({queryKey: MANUAL_PROJECTS_QUERY_KEY});
            await queryClient.invalidateQueries({queryKey: MANUAL_CATEGORIES_QUERY_KEY});
            if (action.type === "create") {
                setName("");
                setCreateName("");
                setCreating(null);
                if (typeof id === "number") onChange(id);
                if (pickerOpen) closePicker();
            }
            if (action.type === "edit") setEditId(null);
            if (action.type !== "create") await Promise.all(["manualTimeBlocks", "week_statistics", "day_statistics", "range_statistics", "total_statistics", "category_app_logs"].map((key) => queryClient.invalidateQueries({queryKey: [key]})));
            if (action.type === "delete") {
                setDeleteId(null);
                await Promise.all(["manualTimeBlocks", "runningManualTimer"].map((key) => queryClient.invalidateQueries({queryKey: [key]})));
            }
        },
        onError: (value) => setError(String(value)),
    });
    const act = (action: ProjectAction) => {
        if (action.type !== "delete" && !action.name.trim()) { setError("Enter a category name."); return; }
        setError(null);
        mutation.mutate(action);
    };
    const close = () => {
        if (mutation.isPending) return;
        setOpen(false);
        manageRef.current?.focus();
    };
    const closePicker = () => {
        setPickerOpen(false);
        setQuery("");
        setCreating(null);
        setError(null);
        triggerRef.current?.focus();
    };
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Tab") {
                const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
                const first = controls?.[0];
                const last = controls?.[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
                else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
            }
            if (event.key === "Escape" && !mutation.isPending) {
                event.preventDefault();
                setOpen(false);
                manageRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, mutation.isPending]);

    const colorOf = (id: number | null) => categories.find((category) => category.id === id)?.color ?? "#64748b";
    const uncategorizedName = categories.find((category) => category.id === null)?.name ?? "Uncategorized";
    const selected = projects.find((project) => project.id === value);
    const childrenOf = (id: number) => projects.filter((project) => project.parent_id === id);
    const topLevel = projects.filter((project) => project.parent_id == null || !projects.some((parent) => parent.id === project.parent_id));
    const search = query.trim().toLowerCase();
    const matches = (project: ManualProject) => project.name.toLowerCase().includes(search);
    // While searching, a category stays visible when it or any of its subcategories match.
    const rows = topLevel.flatMap((parent) => {
        const children = childrenOf(parent.id);
        const matchingChildren = search ? children.filter(matches) : [];
        if (search && !matches(parent) && !matchingChildren.length) return [];
        // Matching subcategories always show; the rest only under an expanded category the search also matches.
        const visibleChildren = expanded.has(parent.id) && (!search || matches(parent)) ? children : matchingChildren;
        return [{project: parent, depth: 0, childCount: children.length},
            ...visibleChildren.map((project) => ({project, depth: 1, childCount: 0}))];
    });
    const showUncategorized = !search || uncategorizedName.toLowerCase().includes(search);
    const options: (number | null)[] = [...(showUncategorized ? [null] : []), ...rows.map((row) => row.project.id)];
    const pick = (id: number | null) => {
        onChange(id);
        // Picking a category with subcategories opens them so one can be chosen next; picking it again closes.
        if (id != null && projects.some((project) => project.parent_id === id) && !(value === id && expanded.has(id))) {
            setExpanded((current) => new Set(current).add(id));
            return;
        }
        closePicker();
    };
    const toggleExpanded = (id: number) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const startCreating = (parentId: number | null) => {
        setError(null);
        setCreating({parentId});
        setCreateName(parentId == null ? query.trim() : "");
        if (parentId != null) setExpanded((current) => new Set(current).add(parentId));
    };
    const openPicker = () => {
        setError(null);
        // Reveal the current subcategory so the picker opens where the user left off.
        if (selected?.parent_id != null) setExpanded((current) => new Set(current).add(selected.parent_id!));
        setPickerOpen(true);
    };
    useEffect(() => {
        if (pickerOpen) setActive(Math.max(0, options.indexOf(value)));
        // Only re-anchor the highlight when the picker opens or the search changes.
    }, [pickerOpen, search]);

    const createForm = (parentId: number | null) => <form className={`flex items-center gap-2 py-1.5 ${parentId == null ? "" : "pl-7"}`} onSubmit={(event) => {event.preventDefault(); act({type: "create", name: createName, parentId});}}>
        <input autoFocus aria-label={parentId == null ? "New category name" : "New subcategory name"} value={createName} onChange={(event) => setCreateName(event.target.value)} onKeyDown={(event) => {if (event.key === "Escape") {event.stopPropagation(); setCreating(null);}}} maxLength={100} placeholder={parentId == null ? "Category name" : "Subcategory name"} disabled={mutation.isPending} className="min-w-0 flex-1 rounded-md border border-gray-700 bg-black px-2 py-1.5 text-sm text-white outline-none focus:border-sky-500" />
        <button type="submit" disabled={mutation.isPending || !createName.trim()} className="rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50">Add</button>
    </form>;

    const projectName = (project: ManualProject) => manualCategoryLabel(project, projects);
    return <>
        <div className="flex min-w-0 items-center gap-1">
            <button ref={triggerRef} type="button" aria-label="Category" aria-haspopup="listbox" aria-expanded={pickerOpen} disabled={disabled || isLoading || Boolean(loadError)} onClick={() => pickerOpen ? closePicker() : openPicker()} title={selected ? projectName(selected) : uncategorizedName} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-2 text-left text-sm text-gray-200 outline-none focus:border-sky-500 disabled:opacity-50">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor: colorOf(selected?.id ?? null)}} />
                <span className="min-w-0 flex-1 truncate">
                    {isLoading ? "Loading categories…" : loadError ? "Categories unavailable" : selected ? <>
                        {selected.parent_id != null && <span className="text-gray-500">{projects.find((project) => project.id === selected.parent_id)?.name} › </span>}
                        {selected.name}
                    </> : <span className="text-gray-400">{uncategorizedName}</span>}
                </span>
                <span className="text-gray-500"><Chevron open={pickerOpen} /></span>
            </button>
            <button ref={manageRef} type="button" disabled={disabled} onClick={() => {setError(null); setOpen(true);}} aria-label="Manage categories" title="Rename or delete categories" className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
        </div>
        {pickerOpen && <ManualPopover anchor={triggerRef.current} onClose={closePicker} labelledBy="manual-category-picker-search" width="anchor">
            <div className="-m-2 flex max-h-[60vh] flex-col">
                <div className="relative mb-2">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                    <input id="manual-category-picker-search" autoFocus aria-label="Search categories" role="combobox" aria-expanded aria-controls="manual-category-options" aria-activedescendant={options.length ? `manual-category-option-${options[Math.min(active, options.length - 1)] ?? "none"}` : undefined} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                            event.preventDefault();
                            if (options.length) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
                        }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            if (options.length) pick(options[Math.min(active, options.length - 1)]);
                            else if (search) startCreating(null);
                        }
                    }} placeholder="Search category or subcategory" className="w-full rounded-lg border border-gray-700 bg-black py-2 pl-8 pr-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-sky-500" />
                </div>
                {error && <p role="alert" className="mb-2 px-1 text-sm text-red-400">{error}</p>}
                <div id="manual-category-options" role="listbox" aria-label="Categories" className="min-h-0 flex-1 overflow-y-auto nice-scrollbar">
                    {showUncategorized && <div id="manual-category-option-none" role="option" aria-selected={value === null} onPointerEnter={() => setActive(options.indexOf(null))} onClick={() => pick(null)} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm ${options[active] === null ? "bg-gray-800/80" : ""} ${value === null ? "text-white" : "text-gray-300"}`}>
                        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{backgroundColor: colorOf(null)}} />
                        {uncategorizedName}
                    </div>}
                    {rows.map(({project, depth, childCount}) => {
                        const isActive = options[active] === project.id;
                        const isOpen = expanded.has(project.id);
                        const isLastChild = depth === 1 && rows.filter((row) => row.project.parent_id === project.parent_id).slice(-1)[0]?.project.id === project.id;
                        return <div key={project.id}>
                            {depth === 0 && <div className="mt-1 border-t border-gray-800/80" />}
                            <div className={`group flex items-center gap-1 rounded-md ${isActive ? "bg-gray-800/80" : ""}`} onPointerEnter={() => setActive(options.indexOf(project.id))}>
                                <div id={`manual-category-option-${project.id}`} role="option" aria-selected={value === project.id} onClick={() => pick(project.id)} className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 text-sm ${depth ? "pl-7 pr-2" : "px-2"} ${value === project.id ? "font-medium text-sky-300" : depth ? "text-gray-300" : "text-gray-100"}`}>
                                    {depth === 0 && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor: colorOf(project.id)}} />}
                                    <span className="truncate">{project.name}</span>
                                </div>
                                {depth === 0 && (childCount > 0
                                    ? <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} ${project.name} subcategories`} onClick={() => toggleExpanded(project.id)} className={`mr-1 flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs ${isOpen ? "border-sky-700 text-sky-300" : "border-transparent text-gray-400 hover:border-gray-700 hover:text-white"}`}>
                                        {childCount} {childCount === 1 ? "sub" : "subs"} <Chevron open={isOpen} />
                                    </button>
                                    : <button type="button" aria-label={`Add subcategory to ${project.name}`} onClick={() => startCreating(project.id)} className="mr-1 shrink-0 rounded-md px-2 py-1 text-xs text-sky-400 opacity-0 transition hover:bg-gray-800 hover:text-sky-300 focus-visible:opacity-100 group-hover:opacity-100">
                                        + Subcategory
                                    </button>)}
                            </div>
                            {isLastChild && project.parent_id != null && expanded.has(project.parent_id) && (creating?.parentId === project.parent_id
                                ? createForm(project.parent_id)
                                : <button type="button" onClick={() => startCreating(project.parent_id!)} className="flex w-full items-center gap-2 rounded-md py-1.5 pl-7 text-left text-xs text-sky-400 hover:bg-gray-800/60 hover:text-sky-300"><Plus size={12} /> Add subcategory</button>)}
                            {depth === 0 && childCount === 0 && creating?.parentId === project.id && createForm(project.id)}
                        </div>;
                    })}
                    {!options.length && <p className="px-2 py-4 text-center text-sm text-gray-500">No categories match “{query.trim()}”.</p>}
                </div>
                <div className="mt-2 border-t border-gray-800 pt-2">
                    {creating?.parentId === null ? createForm(null) : <button type="button" onClick={() => startCreating(null)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-sky-400 hover:bg-gray-800/60 hover:text-sky-300">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current"><Plus size={12} /></span>
                        {search && !projects.some((project) => project.name.toLowerCase() === search) ? <>Create category “{query.trim()}”</> : "Create new category"}
                    </button>}
                </div>
            </div>
        </ManualPopover>}
        {open && <ManualPopover anchor={manageRef.current} onClose={close} labelledBy="manage-manual-categories-title">
            <div ref={dialogRef} className="flex max-h-[70vh] flex-col">
                <div className="mb-4 flex items-center justify-between">
                    <h2 id="manage-manual-categories-title" className="text-xl font-semibold text-white">Categories</h2>
                    <button type="button" onClick={close} disabled={mutation.isPending} aria-label="Close categories" className="rounded px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-white">×</button>
                </div>
                <form className="mb-4 flex gap-2" onSubmit={(event) => {event.preventDefault(); act({type: "create", name, parentId: null});}}>
                    <input autoFocus aria-label="New category name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="New category name" disabled={mutation.isPending} className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
                    <button type="submit" disabled={mutation.isPending || !name.trim()} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">Create</button>
                </form>
                {(error || loadError) && <p role="alert" className="mb-3 text-sm text-red-400">{error || String(loadError)}</p>}
                <div className="min-h-0 overflow-y-auto nice-scrollbar">
                    {!projects.length && <p className="py-6 text-center text-sm text-gray-500">Create a category to organize your manual time.</p>}
                    {projects.map((project) => {
                        const isChild = project.parent_id != null;
                        const parentName = isChild ? projects.find((parent) => parent.id === project.parent_id)?.name : undefined;
                        return <div key={project.id} className={isChild ? "py-2 pl-6" : "border-t border-gray-800 py-3"}>
                            {editId === project.id ? <form className="flex items-center gap-2" onSubmit={(event) => {event.preventDefault(); act({type: "edit", id: project.id, name: editName});}}>
                                <input autoFocus aria-label={`Rename ${project.name}`} value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={100} disabled={mutation.isPending} className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-2 py-1.5 text-sm text-white outline-none focus:border-sky-500" />
                                <button type="submit" disabled={mutation.isPending} className="text-sm text-sky-300 hover:text-white">Save</button>
                                <button type="button" disabled={mutation.isPending} onClick={() => setEditId(null)} className="text-sm text-gray-400 hover:text-white">Cancel</button>
                            </form> : <div className="flex items-center gap-3">
                                {!isChild && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor: colorOf(project.id)}} />}
                                <span className={`min-w-0 flex-1 truncate text-sm ${isChild ? "text-gray-400" : "text-gray-200"}`}>{project.name}</span>
                                <button type="button" disabled={mutation.isPending} onClick={() => {setEditId(project.id); setEditName(project.name); setDeleteId(null);}} className="text-sm text-gray-400 hover:text-white" aria-label={`Edit ${project.name}`}>Edit</button>
                                <button type="button" disabled={mutation.isPending} onClick={() => {setDeleteId(project.id); setEditId(null);}} className="text-sm text-red-400 hover:text-red-300" aria-label={`Delete ${project.name}`}>Delete</button>
                            </div>}
                            {deleteId === project.id && <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 p-3">
                                <p className="text-sm text-gray-300">{isChild
                                    ? `Delete this subcategory? Its time entries will move to ${parentName}.`
                                    : childrenOf(project.id).length
                                        ? "Delete this category and its subcategories? Their time entries will be kept without a category."
                                        : "Delete this category? Its time entries will be kept without a category."}</p>
                                <div className="mt-3 flex justify-end gap-3">
                                    <button type="button" disabled={mutation.isPending} onClick={() => setDeleteId(null)} className="text-sm text-gray-400 hover:text-white">Cancel</button>
                                    <button type="button" disabled={mutation.isPending} onClick={() => act({type: "delete", id: project.id})} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:opacity-50">Delete {isChild ? "subcategory" : "category"}</button>
                                </div>
                            </div>}
                        </div>;
                    })}
                </div>
            </div>
        </ManualPopover>}
    </>;
}
