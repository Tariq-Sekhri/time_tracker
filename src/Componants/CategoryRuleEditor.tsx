import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {delete_cat_regex_by_id, update_cat_regex_by_id, type CategoryRegex} from "../api/CategoryRegex.ts";
import {categoryLabel, type Category} from "../api/Category.ts";
import {nestManualCategories} from "../api/ManualProject.ts";
import ManualPopover from "./ManualPopover.tsx";

export default function CategoryRuleEditor({rule, categories, anchor, mode, onClose, onSaved}: {
    rule: CategoryRegex; categories: Category[]; anchor: HTMLElement | null; mode: "edit" | "delete";
    onClose: () => void; onSaved: () => void;
}) {
    const [pattern, setPattern] = useState(rule.regex);
    const [categoryId, setCategoryId] = useState(rule.cat_id);
    const save = useMutation({
        mutationFn: () => mode === "delete" ? delete_cat_regex_by_id(rule.id) : update_cat_regex_by_id({...rule, regex: pattern, cat_id: categoryId}),
        onSuccess: onSaved,
    });
    const close = () => {if (!save.isPending) onClose();};
    return <ManualPopover anchor={anchor} onClose={close} labelledBy="matched-rule-title" width={360} beside>
        <form onSubmit={(event) => {event.preventDefault(); if (mode === "delete" || pattern.trim()) save.mutate();}}>
            <h2 id="matched-rule-title" className="mb-3 text-base font-semibold">{mode === "delete" ? "Delete matching regex?" : "Edit matching regex"}</h2>
            <p className="mb-4 text-xs text-gray-400">This rule applies to every matching app. Recorded logs are kept.</p>
            {mode === "delete" ? <p className="mb-4 break-all rounded-lg bg-gray-900 p-3 font-mono text-sm">{rule.regex}</p> : <>
                <label className="block text-xs text-gray-400">Category
                    <select value={categoryId} disabled={save.isPending} onChange={(event) => setCategoryId(Number(event.target.value))} className="mt-1 mb-3 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white">
                        {nestManualCategories(categories).map((category) => <option key={category.id} value={category.id}>{categoryLabel(category, categories)}</option>)}
                    </select>
                </label>
                <label className="block text-xs text-gray-400">Regex pattern
                    <textarea autoFocus value={pattern} disabled={save.isPending} onChange={(event) => setPattern(event.target.value)} rows={3} className="mt-1 block w-full resize-y rounded-lg border border-gray-700 bg-black px-3 py-2 font-mono text-sm text-white outline-none focus:border-sky-500" />
                </label>
            </>}
            {save.error && <p role="alert" className="mt-3 break-words text-sm text-red-400">{String(save.error)}</p>}
            <div className="mt-4 flex justify-end gap-2">
                <button autoFocus={mode === "delete"} type="button" onClick={close} disabled={save.isPending} className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white">Cancel</button>
                <button type="submit" disabled={save.isPending || (mode === "edit" && !pattern.trim())} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${mode === "delete" ? "bg-red-600 hover:bg-red-500" : "bg-sky-600 hover:bg-sky-500"}`}>{save.isPending ? "Saving…" : mode === "delete" ? "Delete regex" : "Save regex"}</button>
            </div>
        </form>
    </ManualPopover>;
}
