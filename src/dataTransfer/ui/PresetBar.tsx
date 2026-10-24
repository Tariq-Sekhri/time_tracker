import {useState} from "react";
import {IconSave, IconTrash} from "./icons.tsx";
import type {ExportPreset} from "./presets.ts";
import type {BuiltInExportPreset} from "./builtInPresets.ts";

/** Saved export presets: pick one to apply, save the current settings, or delete. */
export default function PresetBar({presets, builtIns = [], active, onApply, onCustom, onSave, onDelete}: {
    presets: ExportPreset[];
    builtIns?: BuiltInExportPreset[];
    /** Matching preset key, prefixed with saved: or builtin:. */
    active: string | null;
    onApply: (preset: ExportPreset) => void;
    /** Chosen "Custom": go back to picking the data by hand. */
    onCustom?: () => void;
    onSave: (name: string) => Promise<void> | void;
    onDelete: (name: string) => void;
}) {
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState("");
    const activeSaved = presets.find(item => `saved:${item.name}` === active);
    const activeBuiltIn = builtIns.find(item => `builtin:${item.name}` === active);
    const activeName = activeSaved?.name ?? activeBuiltIn?.name ?? "";
    const exists = presets.some((item) => item.name.toLowerCase() === name.trim().toLowerCase());
    const save = async () => {
        if (!name.trim()) return;
        await onSave(name.trim());
        setNaming(false);
        setName("");
    };

    return <div className="dt-presets">
        <label htmlFor="dt-preset-select">Preset</label>
        <select id="dt-preset-select" className="dt-select" value={activeSaved ? `saved:${activeSaved.name}` : activeBuiltIn ? `builtin:${activeBuiltIn.name}` : "custom"}
            onChange={(event) => {
                const value = event.target.value;
                const preset = value.startsWith("builtin:")
                    ? builtIns.find(item => `builtin:${item.name}` === value)
                    : presets.find(item => `saved:${item.name}` === value);
                if (preset) onApply(preset);
                else if (value === "custom") onCustom?.();
            }}>
            <option value="custom">Advanced</option>
            {builtIns.map(item => <option key={item.name} value={`builtin:${item.name}`}>{item.name}</option>)}
            {presets.length > 0 && <optgroup label="My presets">{presets.map(item => <option key={item.name} value={`saved:${item.name}`}>{item.name}</option>)}</optgroup>}
        </select>
        {activeSaved && <button type="button" className="dt-button dt-button-ghost dt-button-danger" aria-label={`Delete preset ${activeName}`} title="Delete preset"
            onClick={() => {if (window.confirm(`Delete the preset “${activeName}”?`)) onDelete(activeSaved.name);}}>
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
            : <button type="button" className="dt-button" onClick={() => {setName(activeName); setNaming(true);}}>
                <IconSave className="dt-icon-sm" /> Save as preset…
            </button>}
    </div>;
}
