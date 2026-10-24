import type {ExportPreset} from "./presets.ts";
import type {BuiltInExportPreset} from "./builtInPresets.ts";

/** Large first-step preset picker. Advanced leaves the choice of data to the user. */
export default function PresetGrid({presets, builtIns, active, custom, onPick, onCustom}: {
    presets: ExportPreset[];
    builtIns: BuiltInExportPreset[];
    active: string | null;
    custom: boolean;
    onPick: (preset: ExportPreset) => void;
    onCustom: () => void;
}) {
    const card = (key: string, preset: ExportPreset & {description?: string}) => <button type="button" key={key} className="ex-preset-card" aria-pressed={!custom && active === key} onClick={() => onPick(preset)}>
        <strong>{preset.name}</strong>{preset.description && <span>{preset.description}</span>}
    </button>;
    return <div className="ex-preset-grid-wrap">
        <div className="ex-preset-grid">
            {builtIns.map(preset => card(`builtin:${preset.name}`, preset))}
            <button type="button" className="ex-preset-card" aria-pressed={custom} onClick={onCustom}><strong>Advanced</strong><span>Choose exactly which data to export.</span></button>
        </div>
        {presets.length > 0 && <section>
            <div className="ex-eyebrow">My presets</div>
            <div className="ex-preset-grid">{presets.map(preset => card(`saved:${preset.name}`, preset))}</div>
        </section>}
    </div>;
}
