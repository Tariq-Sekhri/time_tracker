import type {ExportPreset} from "./presets.ts";
import type {BuiltInExportPreset} from "./builtInPresets.ts";

/** Large first-step preset picker. Custom leaves the choice of data to the user. */
export default function PresetGrid({presets, builtIns, active, custom, onPick, onCustom}: {
    presets: ExportPreset[];
    builtIns: BuiltInExportPreset[];
    active: string | null;
    custom: boolean;
    onPick: (preset: ExportPreset) => void;
    onCustom: () => void;
}) {
    const groups: {label: string; items: {key: string; preset: ExportPreset}[]}[] = [
        {label: "Confirmed presets", items: builtIns.filter(item => item.group === "confirmed").map(preset => ({key: `builtin:${preset.name}`, preset}))},
        {label: "Suggested presets", items: builtIns.filter(item => item.group === "suggested").map(preset => ({key: `builtin:${preset.name}`, preset}))},
        {label: "My presets", items: presets.map(preset => ({key: `saved:${preset.name}`, preset}))},
    ];
    return <div className="ex-preset-grid-wrap">
        <div className="ex-preset-grid">
            <button type="button" className="ex-preset-card" aria-pressed={custom} onClick={onCustom}><strong>Custom</strong><span>Pick the data yourself</span></button>
        </div>
        {groups.filter(group => group.items.length).map(group => <section key={group.label}>
            <div className="ex-eyebrow">{group.label}</div>
            <div className="ex-preset-grid">
                {group.items.map(({key, preset}) => <button type="button" key={key} className="ex-preset-card" aria-pressed={!custom && active === key} onClick={() => onPick(preset)}>
                    <strong>{preset.name}</strong>
                </button>)}
            </div>
        </section>)}
    </div>;
}
