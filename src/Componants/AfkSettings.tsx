import {useEffect, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {invokeOrThrow} from "../utils.ts";
import {AFK_SOURCES, defaultAfkSettings, evaluateAfk, type AfkSettings as Config, type AfkStatus, type AfkStorage} from "../afk/model.ts";
import {useToast} from "./Toast.tsx";
import {toErrorString} from "../types/common.ts";

const numberClass="w-20 rounded bg-gray-800 px-2 py-1.5 text-sm text-white";
function NumericInput({label,value,min=0,max=100,onChange}:{label:string;value:number;min?:number;max?:number;onChange:(n:number)=>void}) {
    const [text,setText]=useState(String(value));
    useEffect(()=>setText(String(value)),[value]);
    const commit=()=>{const n=Number(text);if(text.trim()&&Number.isFinite(n)){const next=Math.min(max,Math.max(min,Math.trunc(n)));setText(String(next));onChange(next);}else setText(String(value));};
    return <input type="number" aria-label={label} min={min} max={max} step={1} value={text} className={numberClass}
        onChange={e=>{setText(e.target.value);const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>=min&&n<=max)onChange(Math.trunc(n));}} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/>;
}
function NumberField({label,displayLabel,value,min=0,max=100,onChange}:{label:string;displayLabel?:string;value:number;min?:number;max?:number;onChange:(n:number)=>void}) {
    return <label className="flex items-center justify-between gap-3 text-sm text-gray-300">{displayLabel ?? label}
        <NumericInput label={label} value={value} min={min} max={max} onChange={onChange}/>
    </label>;
}
type AfkTab = "Detection" | "Sources" | "Diagnostics";
const sourceGroups = [
    {name: "Input", indices: [0, 1, 2, 3]},
    {name: "Playback", indices: [4, 10, 5, 6]},
    {name: "Session", indices: [7, 8, 9]},
];
function Toggle({label, hint, checked, onChange}: {label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void}) {
    return <label className="settings-toggle-row"><span>{label}{hint && <small>{hint}</small>}</span>
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}
function evidenceLabel(observation: AfkStatus["observations"][number] | undefined, timeout: number) {
    if (!observation?.available) return "Unavailable";
    const active = observation.idle_seconds == null ? observation.active : observation.idle_seconds < timeout;
    return active ? "Active" : "Inactive";
}
export default function AfkSettings() {
    const {showToast} = useToast();
    const client = useQueryClient();
    const settings = useQuery({queryKey: ["afkSettings"], queryFn: () => invokeOrThrow<Config>("get_afk_settings")});
    const status = useQuery({queryKey: ["afkStatus"], queryFn: () => invokeOrThrow<AfkStatus | null>("get_afk_status"), refetchInterval: 2000});
    const storage = useQuery({queryKey: ["afkStorage"], queryFn: () => invokeOrThrow<AfkStorage>("get_afk_storage"), refetchInterval: 30000});
    const [draft, setDraft] = useState<Config | null>(null);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState<AfkTab>("Detection");
    const [sourceGroup, setSourceGroup] = useState(0);
    useEffect(() => {if (settings.data) setDraft(structuredClone(settings.data));}, [settings.data]);
    if (settings.error) return <section className="settings-panel text-red-300">Could not load AFK settings: {toErrorString(settings.error)}</section>;
    if (!draft) return <section className="settings-panel text-gray-400">Loading AFK settings?</section>;
    const dirty = JSON.stringify(draft) !== JSON.stringify(settings.data);
    const preview = status.data ? evaluateAfk(draft, status.data.observations) : null;
    const update = (patch: Partial<Config>) => setDraft({...draft, ...patch});
    const sourceUpdate = (i: number, patch: Partial<Config["sources"][number]>) => update({sources: draft.sources.map((source, j) => j === i ? {...source, ...patch} : source)});
    const save = async () => {
        setBusy(true);
        try {
            await invokeOrThrow("set_afk_settings", {settings: draft});
            await client.invalidateQueries({queryKey: ["afkSettings"]});
            showToast("AFK settings saved", "success");
        } catch (error) {showToast("Could not save AFK settings", "error", 5000, toErrorString(error));}
        finally {setBusy(false);}
    };
    return <section className="settings-panel afk-settings-panel" aria-labelledby="afk-settings-title">
        <div className="settings-section-heading">
            <div><h2 id="afk-settings-title">AFK detection</h2><p>Decide what counts as away time. Logging always continues.</p></div>
            <span className={`afk-state-pill afk-state-${status.data?.decision.state ?? "unknown"}`}>
                {status.data?.decision.state === "present" ? "Present" : status.data?.decision.state === "afk" ? "Away" : "Waiting for evidence"}
            </span>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="AFK settings" onKeyDown={event => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const tabs = ["Detection", "Sources", "Diagnostics"] as AfkTab[];
            const next = (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
            setTab(tabs[next]); document.getElementById(`afk-tab-${tabs[next]}`)?.focus();
        }}>
            {(["Detection", "Sources", "Diagnostics"] as AfkTab[]).map(name => <button key={name} type="button"
                id={`afk-tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`afk-panel-${name}`} tabIndex={tab === name ? 0 : -1}
                onClick={() => setTab(name)}>{name}</button>)}
        </div>

        <div role="tabpanel" id={`afk-panel-${tab}`} aria-labelledby={`afk-tab-${tab}`} className="afk-tab-content">
            {tab === "Detection" && <>
                <Toggle label="Label AFK time" hint="Activity and evidence are kept even when labels are off." checked={draft.enabled} onChange={enabled => update({enabled})}/>
                <p className="text-sm text-gray-400">AFK logs stay out of normal activity and statistics. Enable Include AFK to show away blocks on the calendar, then click one for its sources, confidence, and captured logs. The Timeblock detection settings above group nearby AFK periods.</p>
                <div className="settings-field-grid afk-number-grid">
                    <NumberField label="Minimum agreeing sources / groups" displayLabel="Minimum agreement" value={draft.minimum_sources} min={1} max={11} onChange={minimum_sources => update({minimum_sources})}/>
                    <NumberField label="Away score threshold (%)" value={draft.away_threshold} min={1} onChange={away_threshold => update({away_threshold})}/>
                    <NumberField label="AFK entry delay (seconds)" value={draft.enter_delay_seconds} max={3600} onChange={enter_delay_seconds => update({enter_delay_seconds})}/>
                    <NumberField label="Return delay (seconds)" value={draft.exit_delay_seconds} max={3600} onChange={exit_delay_seconds => update({exit_delay_seconds})}/>
                </div>
                <div className="settings-field-grid afk-toggle-grid">
                    <Toggle label="Group related signals" hint="Count input and playback as one vote each." checked={draft.group_related_sources} onChange={group_related_sources => update({group_related_sources})}/>
                    <Toggle label="Lock overrides the score" hint="An observed screen lock counts as away." checked={draft.locked_is_away} onChange={locked_is_away => update({locked_is_away})}/>
                </div>
            </>}

            {tab === "Sources" && <>
                <div className="afk-source-navigation" aria-label="Signal groups">
                    {sourceGroups.map((group, i) => <button key={group.name} type="button" aria-pressed={sourceGroup === i} onClick={() => setSourceGroup(i)}>
                        {group.name}<span>{group.indices.length}</span>
                    </button>)}
                </div>
                <div className="afk-source-grid">
                    {sourceGroups[sourceGroup].indices.map(i => {
                        const source = AFK_SOURCES[i], rule = draft.sources[i], observation = status.data?.observations[i];
                        const evidence = evidenceLabel(observation, rule.timeout_seconds);
                        return <article key={source.id} className="afk-source-card">
                            <div className="afk-source-heading"><div><h3>{source.label}</h3><span className={`afk-evidence afk-evidence-${evidence.toLowerCase()}`} title={observation?.detail}>{evidence}</span></div>
                                <input aria-label={`Enable ${source.label}`} type="checkbox" checked={rule.enabled} onChange={event => sourceUpdate(i, {enabled: event.target.checked})}/>
                            </div>
                            <div className="afk-source-fields">
                                <NumberField label={`${source.label} weight`} displayLabel="Weight" value={rule.weight} onChange={weight => sourceUpdate(i, {weight})}/>
                                {(i < 4 || i === 6) && <NumberField label={`${source.label} inactivity seconds`} displayLabel="Idle after (seconds)" value={rule.timeout_seconds} min={1} max={86400} onChange={timeout_seconds => sourceUpdate(i, {timeout_seconds})}/>}
                                {(i < 8 || i === 10) ? <label className="afk-source-silence"><input aria-label={`${source.label} silence votes away`} type="checkbox" checked={rule.absence_is_away} onChange={event => sourceUpdate(i, {absence_is_away: event.target.checked})}/>Silence votes away</label>
                                    : <p className="settings-muted">Active state votes away.</p>}
                            </div>
                            <details className="afk-source-help"><summary>About this signal</summary><p>{source.note}</p></details>
                        </article>;
                    })}
                </div>
                <p className="settings-muted afk-source-note">Weight 0 ignores a vote. Unavailable signals never vote.</p>
            </>}

            {tab === "Diagnostics" && <>
                <div className="afk-storage-grid">
                    <div><small>Evidence intervals</small><strong>{storage.data?.intervals.toLocaleString() ?? "?"}</strong></div>
                    <div><small>AFK storage</small><strong>{storage.data?.allocated_bytes == null ? "Unavailable" : `${(storage.data.allocated_bytes / 1024).toFixed(1)} KiB`}</strong></div>
                    <div><small>Activity records</small><strong>{storage.data?.activity_rows.toLocaleString() ?? "?"}</strong></div>
                </div>
                <div className="afk-evidence-list">
                    {AFK_SOURCES.map((source, i) => <div key={source.id}><span>{source.label}</span>
                        <span title={status.data?.observations[i]?.detail} className="settings-muted">{evidenceLabel(status.data?.observations[i], draft.sources[i].timeout_seconds)}</span></div>)}
                </div>
                <details className="afk-source-help"><summary>How decisions and history work</summary>
                    <p>Away score is away weight divided by total voting weight. Related signals use their strongest weight, with presence winning within a group. Entry and return delays apply before the label changes.</p>
                    <p>Settings affect future evidence. Earlier decisions keep their settings, and unknown time remains included. Signals currently support Windows. AFK history syncs with the server and hides activity only for the device that was away.</p>
                </details>
            </>}
        </div>

        {preview && <div className="afk-preview-strip" aria-live="polite">
            <span><strong>{dirty ? "Draft preview" : "Instant evidence"}: {preview.state.toUpperCase()}</strong></span>
            <span>{preview.away_score}% away</span><span>{preview.agreeing_sources} agreeing {draft.group_related_sources ? "groups" : "sources"}</span>
        </div>}
        {status.data && !status.data.recording && <p className="afk-runtime-note">{status.data.simulated ? "Demo ? simulated evidence" : "Development preview ? live signals, no recording"}</p>}
        {status.error && <p className="text-sm text-red-300">Live evidence unavailable: {toErrorString(status.error)}</p>}
        {status.data?.storage_error && <p className="text-sm text-red-300">AFK storage: {status.data.storage_error}. Activity logging continues.</p>}
        <footer className="afk-settings-footer">
            <div className="afk-reset-actions"><button type="button" disabled={busy} onClick={() => setDraft(defaultAfkSettings())}>Starting settings</button>
                <button type="button" disabled={!dirty || busy} onClick={() => setDraft(structuredClone(settings.data!))}>Discard changes</button></div>
            <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="settings-primary-button">{busy ? "Saving?" : "Save AFK settings"}</button>
        </footer>
    </section>;
}
