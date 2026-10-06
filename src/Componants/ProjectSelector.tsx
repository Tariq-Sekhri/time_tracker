import {useEffect, useRef, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createManualProject, deleteManualProject, getManualProjects, MANUAL_PROJECTS_QUERY_KEY, updateManualProject} from "../api/ManualProject.ts";
import ManualPopover from "./ManualPopover.tsx";

type ProjectAction = {type: "create"; name: string} | {type: "edit"; id: number; name: string} | {type: "delete"; id: number};

export default function ProjectSelector({value, onChange, disabled = false}: {
    value: number | null;
    onChange: (id: number | null) => void;
    disabled?: boolean;
}) {
    const queryClient = useQueryClient();
    const {data: projects = [], isLoading, error: loadError} = useQuery({queryKey: MANUAL_PROJECTS_QUERY_KEY, queryFn: getManualProjects});
    const selectRef = useRef<HTMLSelectElement>(null);
    const manageRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
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
            if (action.type === "create") return createManualProject(action.name.trim());
            if (action.type === "edit") return updateManualProject(action.id, action.name.trim());
            return deleteManualProject(action.id);
        },
        onSuccess: async (id, action) => {
            await queryClient.invalidateQueries({queryKey: MANUAL_PROJECTS_QUERY_KEY});
            if (action.type === "create") {
                setName("");
                if (typeof id === "number") onChange(id);
            }
            if (action.type === "edit") setEditId(null);
            if (action.type !== "create") await Promise.all(["manualTimeBlocks", "week_statistics", "day_statistics", "range_statistics", "total_statistics", "category_app_logs"].map((key) => queryClient.invalidateQueries({queryKey: [key]})));
            if (action.type === "delete") {
                setDeleteId(null);
                if (value === action.id) onChange(null);
                await Promise.all(["manualTimeBlocks", "runningManualTimer"].map((key) => queryClient.invalidateQueries({queryKey: [key]})));
            }
        },
        onError: (value) => setError(String(value)),
    });
    const act = (action: ProjectAction) => {
        if (action.type !== "delete" && !action.name.trim()) { setError("Enter a project name."); return; }
        setError(null);
        mutation.mutate(action);
    };
    const close = () => {
        if (mutation.isPending) return;
        setOpen(false);
        selectRef.current?.focus();
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
                selectRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, mutation.isPending]);

    return <>
        <div className="flex min-w-0 items-center gap-1">
            <select ref={selectRef} aria-label="Project" value={projects.some((project) => project.id === value) ? String(value) : ""} disabled={disabled || isLoading || Boolean(loadError)} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-2 text-sm text-gray-200 outline-none focus:border-sky-500 disabled:opacity-50">
                <option value="">{isLoading ? "Loading projects…" : loadError ? "Projects unavailable" : "No project"}</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button ref={manageRef} type="button" disabled={disabled} onClick={() => {setError(null); setOpen(true);}} aria-label="Manage projects" title="Create, edit, or delete projects" className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
        </div>
        {open && <ManualPopover anchor={manageRef.current} onClose={close} labelledBy="manage-projects-title">
            <div ref={dialogRef} className="flex max-h-[70vh] flex-col">
                <div className="mb-4 flex items-center justify-between">
                    <h2 id="manage-projects-title" className="text-xl font-semibold text-white">Projects</h2>
                    <button type="button" onClick={close} disabled={mutation.isPending} aria-label="Close projects" className="rounded px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-white">×</button>
                </div>
                <form className="mb-4 flex gap-2" onSubmit={(event) => {event.preventDefault(); act({type: "create", name});}}>
                    <input autoFocus aria-label="New project name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="New project name" disabled={mutation.isPending} className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
                    <button type="submit" disabled={mutation.isPending || !name.trim()} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">Create</button>
                </form>
                {(error || loadError) && <p role="alert" className="mb-3 text-sm text-red-400">{error || String(loadError)}</p>}
                <div className="min-h-0 overflow-y-auto nice-scrollbar">
                    {!projects.length && <p className="py-6 text-center text-sm text-gray-500">Create a project to organize your manual time.</p>}
                    {projects.map((project) => <div key={project.id} className="border-t border-gray-800 py-3">
                        {editId === project.id ? <form className="flex items-center gap-2" onSubmit={(event) => {event.preventDefault(); act({type: "edit", id: project.id, name: editName});}}>
                            <input autoFocus aria-label={`Rename ${project.name}`} value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={100} disabled={mutation.isPending} className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-2 py-1.5 text-sm text-white outline-none focus:border-sky-500" />
                            <button type="submit" disabled={mutation.isPending} className="text-sm text-sky-300 hover:text-white">Save</button>
                            <button type="button" disabled={mutation.isPending} onClick={() => setEditId(null)} className="text-sm text-gray-400 hover:text-white">Cancel</button>
                        </form> : <div className="flex items-center gap-3">
                            <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{project.name}</span>
                            <button type="button" disabled={mutation.isPending} onClick={() => {setEditId(project.id); setEditName(project.name); setDeleteId(null);}} className="text-sm text-gray-400 hover:text-white" aria-label={`Edit ${project.name}`}>Edit</button>
                            <button type="button" disabled={mutation.isPending} onClick={() => {setDeleteId(project.id); setEditId(null);}} className="text-sm text-red-400 hover:text-red-300" aria-label={`Delete ${project.name}`}>Delete</button>
                        </div>}
                        {deleteId === project.id && <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 p-3">
                            <p className="text-sm text-gray-300">Delete this project? Its time entries will be kept without a project.</p>
                            <div className="mt-3 flex justify-end gap-3">
                                <button type="button" disabled={mutation.isPending} onClick={() => setDeleteId(null)} className="text-sm text-gray-400 hover:text-white">Cancel</button>
                                <button type="button" disabled={mutation.isPending} onClick={() => act({type: "delete", id: project.id})} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:opacity-50">Delete project</button>
                            </div>
                        </div>}
                    </div>)}
                </div>
            </div>
        </ManualPopover>}
    </>;
}
