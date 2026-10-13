import {useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {MANUAL_CATEGORIES_QUERY_KEY, MANUAL_PROJECTS_QUERY_KEY, updateManualCategory, type ManualCategory} from "../api/ManualProject.ts";
import {get_categories, update_category_by_id, type Category} from "../api/Category.ts";
import {update_google_calendar, type GoogleCalendar} from "../api/GoogleCalendar.ts";
import {manualTimeQueryKeys} from "../Screens/Calander/manualCalendarEditing.ts";
import ManualPopover from "./ManualPopover.tsx";

const palette = ["#0ea5e9", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#f97316", "#94a3b8"];

export type EditableSource =
    | {kind: "manual"; value: ManualCategory}
    | {kind: "category"; value: Category}
    | {kind: "google"; value: GoogleCalendar};

export default function SourceEditor({source, anchor, onClose}: {
    source: EditableSource; anchor: HTMLElement; onClose: () => void;
}) {
    const category = source.value;
    const nameLocked = source.kind === "manual" && source.value.id === null;
    const hasPriority = source.kind === "category" && category.name !== "Miscellaneous";
    const [priority, setPriority] = useState(source.kind === "category" ? String(source.value.priority) : "0");
    const [name, setName] = useState(category.name);
    const [color, setColor] = useState(category.color ?? "#94a3b8");
    const queryClient = useQueryClient();
    const save = useMutation({
        mutationFn: async () => {
            if (source.kind === "manual") return updateManualCategory(source.value.id, name.trim(), color);
            if (source.kind === "google") return update_google_calendar({id: source.value.id, name: name.trim(), color});
            const current = (await get_categories()).find((category) => category.id === source.value.id);
            if (!current) throw new Error("Category no longer exists");
            return update_category_by_id({...current, name: name.trim(), color, priority: hasPriority ? Number(priority) : current.priority});
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({queryKey: MANUAL_CATEGORIES_QUERY_KEY}),
                queryClient.invalidateQueries({queryKey: MANUAL_PROJECTS_QUERY_KEY}),
                queryClient.invalidateQueries({queryKey: ["categories"]}),
                queryClient.invalidateQueries({queryKey: ["googleCalendars"]}),
                queryClient.invalidateQueries({queryKey: ["week"]}),
                queryClient.invalidateQueries({queryKey: ["week_app_filter"]}),
                ...manualTimeQueryKeys.map((key) => queryClient.invalidateQueries({queryKey: [key]})),
            ]);
            onClose();
        },
    });
    const validPriority = !hasPriority || (priority.trim() !== "" && Number.isInteger(Number(priority)) && Number(priority) >= -2147483648 && Number(priority) <= 2147483647);
    const close = () => {if (!save.isPending) onClose();};
    return <ManualPopover anchor={anchor} onClose={close} labelledBy="edit-source-title" width={300} beside>
        <form onSubmit={(event) => {event.preventDefault(); if (name.trim() && validPriority) save.mutate();}} onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
            else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
        }}>
            <h2 id="edit-source-title" className="mb-4 text-base font-semibold">{source.kind === "google" ? "Edit calendar" : "Edit category"}</h2>
            <label className="block text-xs text-gray-400">Name
                <input autoFocus={!nameLocked} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} disabled={save.isPending || nameLocked} className="mt-1 block w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-sky-500 disabled:text-gray-500" />
            </label>
            {hasPriority && <label className="mt-4 block text-xs text-gray-400">Priority
                <input aria-label="Priority" aria-describedby="source-priority-help" type="number" step="1" min={-2147483648} max={2147483647} value={priority} onChange={(event) => setPriority(event.target.value)} disabled={save.isPending} className="mt-1 block w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
                <span id="source-priority-help" className="mt-1 block text-[11px] text-gray-500">Higher priority wins when an app matches multiple categories.</span>
            </label>}
            <fieldset disabled={save.isPending} className="mt-4">
                <legend className="mb-2 text-xs text-gray-400">Color</legend>
                <div className="flex flex-wrap gap-2">
                    {palette.map((swatch) => <button key={swatch} autoFocus={nameLocked && swatch === palette[0]} type="button" aria-label={`Use ${swatch}`} aria-pressed={color === swatch} onClick={() => setColor(swatch)} style={{backgroundColor: swatch}} className={`h-6 w-6 rounded-full focus-visible:outline-2 focus-visible:outline-white ${color === swatch ? "ring-2 ring-white ring-offset-2 ring-offset-gray-950" : ""}`} />)}
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                    <input type="color" aria-label="Custom color" value={color} onChange={(event) => setColor(event.target.value)} className="h-8 w-9 cursor-pointer rounded border border-gray-700 bg-transparent" />
                    Custom color <span className="ml-auto font-mono">{color}</span>
                </label>
            </fieldset>
            {save.error && <p role="alert" className="mt-3 text-sm text-red-400">{String(save.error)}</p>}
            <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={close} disabled={save.isPending} className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={save.isPending || !name.trim() || !validPriority} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50">{save.isPending ? "Saving…" : "Save"}</button>
            </div>
        </form>
    </ManualPopover>;
}
