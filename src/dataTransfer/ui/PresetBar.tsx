import {useState} from "react";
import {IconSave, IconTrash} from "./icons.tsx";
import type {ExportPreset} from "./presets.ts";

/** Saved export presets: pick one to apply, save the current settings, or delete. */
export default function PresetBar({presets, active, onApply, onSave, onDelete}: {
    presets: ExportPreset[];
    /** Name of the preset last applied or saved; cleared by the parent on any edit. */
    active: string | null;
    onApply: (preset: ExportPreset) => void;
    onSave: (name: string) => Promise<void> | void;
    onDelete: (name: string) => void;
}) {
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState("");
    const exists = presets.some((item) => item.name.toLowerCase() === name.trim().toLowerCase());
    const save = async () => {
        if (!name.trim()) return;
        await onSave(name.trim());
        setNaming(false);
        setName("");
    };

    return <div className="dt-presets">
        <label htmlFor="dt-preset-select">Preset</label>
        <select id="dt-preset-select" className="dt-select" value={active ?? ""}
            onChange={(event) => {
                const preset = presets.find((item) => item.name === event.target.value);
                if (preset) onApply(preset);
            }}>
            <option value="">{presets.length ? (active ? "—" : "Custom settings") : "No saved presets"}</option>
            {presets.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        {active && <button type="button" className="dt-button dt-button-ghost dt-button-danger" aria-label={`Delete preset ${active}`} title="Delete preset"
            onClick={() => {if (window.confirm(`Delete the preset “${active}”?`)) onDelete(active);}}>
            <IconTrash className="dt-icon-sm" /> Delete
        </button>}
        {naming
            ? <div className="dt-presets-save">
                <input className="dt-input" autoFocus value={name} placeholder="e.g. Monthly client invoice" aria-label="Preset name" maxLength={60}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") void save();
                        if (event.key === "Escape") setNaming(false);
                    }} />
                <button type="button" className="dt-button dt-button-primary" disabled={!name.trim()} onClick={() => void save()}>{exists ? "Replace" : "Save"}</button>
                <button type="button" className="dt-button" onClick={() => setNaming(false)}>Cancel</button>
            </div>
            : <button type="button" className="dt-button" onClick={() => {setName(active ?? ""); setNaming(true);}}>
                <IconSave className="dt-icon-sm" /> Save as preset…
            </button>}
    </div>;
}
