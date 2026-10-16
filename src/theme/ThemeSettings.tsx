import {useEffect, useRef, useState} from "react";
import {activeTheme, useThemeStore} from "./store";
import {COLOR_FIELDS, contrastRatio, normalizeColor, PRESETS, PICKER_FAMILIES, themeFamily, themeBrightness, withBrightness, type ColorKey} from "./model";
import "./editor.css";

function ColorField({field, value, original, onChange}:{field:typeof COLOR_FIELDS[number];value:string;original:string;onChange:(key:ColorKey,value:string)=>void}) {
    const [draft,setDraft]=useState(value);
    useEffect(()=>setDraft(value),[value]);
    const valid=normalizeColor(draft);
    return <div className="theme-color-field">
        <label htmlFor={`theme-${field.key}`}>{field.label}</label>
        <div className="theme-color-input">
            <input type="color" value={value.slice(0,7)} aria-label={`${field.label} picker`} onChange={e=>onChange(field.key,e.target.value+(value.length===9?value.slice(7):""))}/>
            <input id={`theme-${field.key}`} value={draft} spellCheck={false} maxLength={9} aria-invalid={!valid}
                onChange={e=>setDraft(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}
                onBlur={()=>{if(valid)onChange(field.key,valid);else setDraft(value);}}/>
            <button type="button" title={`Reset ${field.label}`} aria-label={`Reset ${field.label}`} disabled={value===original} onClick={()=>onChange(field.key,original)}>↺</button>
        </div>
        {!valid && <small>Use #RGB, #RRGGBB, or #RRGGBBAA.</small>}
    </div>;
}
export default function ThemeSettings() {
    const state=useThemeStore();const theme=activeTheme(state);
    const base=PRESETS.find(p=>p.id===theme.baseId)!;
    const custom=state.customThemes.some(t=>t.id===theme.id);
    const [expanded,setExpanded]=useState(false);
    const [group,setGroup]=useState<string>("Surfaces");
    const [search,setSearch]=useState("");
    const [json,setJson]=useState("");
    const [message,setMessage]=useState("");
    const fileRef=useRef<HTMLInputElement>(null);
    const groups=[...new Set(COLOR_FIELDS.map(f=>f.group))];
    const visible=COLOR_FIELDS.filter(f=>search?`${f.label} ${f.group} ${f.key}`.toLowerCase().includes(search.toLowerCase()):f.group===group);
    const ratio=contrastRatio(theme.colors.text,theme.colors.panel);
    const buttonRatio=contrastRatio(theme.colors.onAccent,theme.colors.accent);
    const importJson=(text:string)=>{try{state.importTheme(text);setExpanded(true);setMessage("Theme imported.");}catch(error){setMessage(error instanceof Error?error.message:"Could not import theme.");}};
    const exportJson=JSON.stringify({version:1,...theme},null,2);
    return <section className="settings-panel theme-panel" aria-label="Appearance and themes">
        <div className="settings-section-heading"><div><h2>Appearance</h2><p>Your workspace, in your colors. Default dark is always one click away.</p></div>
            <button type="button" className="settings-secondary-button" onClick={()=>state.select("dark")}>Use default dark</button>
        </div>
        <div className="theme-presets" role="group" aria-label="Theme presets">
            {PICKER_FAMILIES.map(f=>{const p=withBrightness(PRESETS.find(p=>p.id===f.dark)!,themeBrightness(theme));return <button key={p.id} type="button" className="theme-preset" aria-pressed={themeFamily(theme).dark===p.id} onClick={()=>state.selectFamily(p.id)}>
                <span className="theme-preset-image" style={{background:p.colors.app,borderColor:p.colors.border}} aria-hidden="true">
                    <i style={{background:p.colors.raised}}/><span style={{background:p.colors.panel}}><b style={{background:p.colors.accent}}/><b style={{background:p.colors.border}}/><b style={{background:p.colors.muted}}/></span>
                </span><span>{f.name}</span><small>Dark to light</small>
            </button>;})}
        </div>
        <div className="theme-brightness">
            <div><label htmlFor="theme-brightness">Dark to light</label><output htmlFor="theme-brightness">{themeBrightness(theme)}%</output></div>
            <input id="theme-brightness" type="range" min="0" max="100" step="1" value={themeBrightness(theme)} onChange={e=>state.setBrightness(Number(e.target.value))}/>
            <div className="settings-muted"><span>Dark</span><span>Light</span></div>
            <p className="settings-muted">Choose a color palette, then adjust its brightness. 10% gives the super-dark look. Changes save automatically.</p>
        </div>
        <div className="theme-custom-bar">
            <button className="settings-primary-button" type="button" onClick={()=>{setExpanded(!expanded);}}>{expanded?"Close editor":"Customize colors"}</button>
        </div>
        {expanded && <div className="theme-editor">
            <p className="settings-muted theme-help">Editing a built-in theme creates your own copy.</p>
            <div className="theme-editor-controls">
                <label>Theme name<input aria-label="Theme name" key={theme.id+theme.name} defaultValue={theme.name} maxLength={80} onBlur={e=>state.rename(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></label>
                <label>Native controls<select aria-label="Native controls" value={theme.mode} onChange={e=>state.setMode(e.target.value as "dark"|"light")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
            </div>
            <div className="theme-editor-layout">
                <div className="theme-fields">
                    <input className="theme-search" type="search" aria-label="Search theme colors" placeholder={`Search all ${COLOR_FIELDS.length} colors…`} value={search} onChange={e=>setSearch(e.target.value)}/>
                    <div className="theme-groups" role="group" aria-label="Color groups">{groups.map(g=><button key={g} type="button" aria-pressed={group===g && !search} onClick={()=>{setGroup(g);setSearch("");}}>{g}</button>)}</div>
                    <div className="theme-color-grid">{visible.map(f=><ColorField key={f.key} field={f} value={theme.colors[f.key]} original={base.colors[f.key]} onChange={state.edit}/>)}</div>
                    {visible.length===0 && <p className="settings-muted">No matching colors.</p>}
                    <p className="settings-muted theme-help">Hex colors support transparency: the last two digits in #RRGGBBAA set opacity. Reset a color with ↺.</p>
                </div>
                <aside className="theme-preview" aria-label="Live theme preview">
                    <div className="theme-preview-caption">LIVE PREVIEW<span>Applies across the app</span></div>
                    <div className="theme-preview-window"><div className="theme-preview-nav">Time Tracker<span>●</span></div><div className="theme-preview-body"><div className="theme-preview-side">Overview<br/><strong>Calendar</strong><br/>Notes</div><div className="theme-preview-card"><small>Today</small><h3>4h 32m</h3><div className="theme-preview-chart"><i/><i/><i/><i/><i/></div><input aria-label="Preview task" placeholder="Task name" readOnly/><button type="button" className="settings-primary-button">Start timer</button><p><span className="theme-preview-success">● Synced</span><span className="theme-preview-warning">Away</span></p></div></div></div>
                    {ratio!==null && <p className="settings-muted">Text contrast: {ratio.toFixed(1)}:1</p>}
                    {((ratio!==null && ratio<4.5)||(buttonRatio!==null && buttonRatio<4.5)) && <p className="theme-contrast-warning" role="status">Some text has low contrast. Try stronger text or background colors.</p>}
                    <p className="settings-muted">Restore default dark anytime with <kbd>Ctrl + Alt + Shift + T</kbd>.</p>
                </aside>
            </div>
            <div className="theme-editor-footer"><span className="settings-muted">Changes apply immediately and stay on this desktop.</span><div><button type="button" className="settings-secondary-button" onClick={state.customize}>Duplicate theme</button><button type="button" className="settings-secondary-button" onClick={state.reset}>Reset colors to {base.name}</button>{custom && <button type="button" className="settings-secondary-button" onClick={()=>{if(window.confirm(`Delete “${theme.name}”?`))state.remove();}}>Delete custom theme</button>}</div></div>
        </div>}
        <details className="theme-transfer"><summary>Import &amp; export themes</summary><div>
            <p className="settings-muted">Share a theme as JSON, or keep a backup of your colors.</p>
            <div className="theme-transfer-actions"><button type="button" className="settings-secondary-button" onClick={()=>{setJson(exportJson);setMessage("Theme JSON is ready below.");}}>Show theme JSON</button>
                <button type="button" className="settings-secondary-button" onClick={()=>{void navigator.clipboard.writeText(exportJson).then(()=>setMessage("Theme JSON copied.")).catch(()=>{setJson(exportJson);setMessage("Copy the theme JSON below.");});}}>Copy theme JSON</button>
                <button type="button" className="settings-secondary-button" onClick={()=>fileRef.current?.click()}>Import JSON file</button>
                <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];if(file){if(file.size>100_000)setMessage("Theme JSON is too large.");else void file.text().then(importJson).catch(()=>setMessage("Could not read theme file."));}e.target.value="";}}/>
            </div>
            <label className="theme-json-label">Theme JSON<textarea aria-label="Theme JSON" spellCheck={false} value={json} onChange={e=>setJson(e.target.value)} placeholder="Paste theme JSON here" rows={5}/></label>
            <button type="button" className="settings-primary-button" disabled={!json.trim()} onClick={()=>importJson(json)}>Import as new theme</button>
            {message && <p role="status" className="settings-muted">{message}</p>}
        </div></details>
        {state.storageError && <p role="alert">Your colors are applied, but could not be saved. Export your theme before closing the app.</p>}
    </section>;
}
