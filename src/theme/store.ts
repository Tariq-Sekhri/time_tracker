import {create} from "zustand";
import {applyTheme, parseTheme, PRESETS, STORAGE_KEY, themeBrightness, withBrightness, type ColorKey, type Theme} from "./model";

type Saved = {version: 1; activeId: string; customThemes: Theme[]};
function read(): Saved {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if(raw?.version === 1 && Array.isArray(raw.customThemes)) {
            const customThemes: Theme[] = [];
            for(const input of raw.customThemes) { try { const theme = parseTheme(input); if(!customThemes.some(t=>t.id===theme.id)) customThemes.push(theme); } catch { /* Keep other valid themes. */ } }
            return {version:1,activeId: typeof raw.activeId === "string" ? raw.activeId : "dark",customThemes};
        }
    } catch { /* Default dark also works when storage is unavailable. */ }
    return {version:1,activeId:"dark",customThemes:[]};
}
type State = Saved & {
    select: (id:string)=>void;
    customize: ()=>void;
    edit: (key:ColorKey,color:string)=>void;
    rename: (name:string)=>void;
    setMode: (mode:Theme["mode"])=>void;
    setBrightness: (value:number)=>void;
    selectFamily: (id:string)=>void;
    reset: ()=>void;
    remove: ()=>void;
    importTheme: (json:string)=>void;
    storageError: boolean;
};
export function activeTheme(state:Pick<Saved,"activeId"|"customThemes">):Theme {
    return [...PRESETS,...state.customThemes].find(t=>t.id===state.activeId) ?? PRESETS[0];
}
export const useThemeStore = create<State>((set,get)=>{
    const update=(next:Partial<Saved>)=>{
        const state={...get(),...next};const saved:Saved={version:1,activeId:state.activeId,customThemes:state.customThemes};
        let storageError=false;
        try {localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));} catch {storageError=true;}
        applyTheme(activeTheme(saved));set({...next,storageError});
    };
    const editable=()=>{
        const current=activeTheme(get());
        if(get().customThemes.some(t=>t.id===current.id)) return current;
        const theme={...current,id:"custom-"+crypto.randomUUID(),name:(current.name+" custom").slice(0,80),colors:{...current.colors}};
        update({activeId:theme.id,customThemes:[...get().customThemes,theme]});return theme;
    };
    const replace=(theme:Theme)=>update({customThemes:get().customThemes.map(t=>t.id===theme.id?theme:t)});
    return {...read(),storageError:false,
        select:(id)=>{if([...PRESETS,...get().customThemes].some(t=>t.id===id)) update({activeId:id});},
        customize:()=>{const current=activeTheme(get());const theme={...current,id:"custom-"+crypto.randomUUID(),name:(current.name+" copy").slice(0,80),colors:{...current.colors}};update({activeId:theme.id,customThemes:[...get().customThemes,theme]});},
        setBrightness:(value)=>{if(!Number.isFinite(value))return;replace(withBrightness(editable(),value));},
        selectFamily:(id)=>{
            const brightness=themeBrightness(activeTheme(get()));
            const preset=PRESETS.find(p=>p.id===id);if(!preset)return;
            if(brightness===100 && activeTheme(get()).mode==="dark"){update({activeId:id});return;}
            const theme=withBrightness({...preset,mode:activeTheme(get()).mode,id:"custom-"+crypto.randomUUID(),name:preset.name+" custom"},brightness);
            update({activeId:theme.id,customThemes:[...get().customThemes,theme]});
        },
        edit:(key,color)=>{if(activeTheme(get()).colors[key]===color)return;const current=editable();const theme=parseTheme({...current,colors:{...current.colors,[key]:color}});replace(theme);},
        rename:(name)=>{if(name.trim() && name.length<=80 && name.trim()!==activeTheme(get()).name) replace({...editable(),name:name.trim()});},
        setMode:(mode)=>{if(activeTheme(get()).mode!==mode)replace(withBrightness({...editable(),mode},themeBrightness(activeTheme(get()))));},
        reset:()=>{const theme=activeTheme(get());if(!get().customThemes.some(t=>t.id===theme.id))return;const base=PRESETS.find(t=>t.id===theme.baseId)!;replace({...theme,brightness:undefined,mode:base.mode,colors:{...base.colors}});},
        remove:()=>{const id=get().activeId;update({activeId:"dark",customThemes:get().customThemes.filter(t=>t.id!==id)});},
        importTheme:(json)=>{if(json.length>100_000) throw new Error("Theme JSON is too large.");const parsed=parseTheme(JSON.parse(json));const theme={...parsed,id:"custom-"+crypto.randomUUID()};update({activeId:theme.id,customThemes:[...get().customThemes,theme]});},
    };
});
export function initializeTheme() {
    applyTheme(activeTheme(useThemeStore.getState()));
    const reset=(event:KeyboardEvent)=>{if(event.ctrlKey && event.altKey && event.shiftKey && event.code === "KeyT") {event.preventDefault();useThemeStore.getState().select("dark");}};
    window.addEventListener("keydown",reset);
    return ()=>window.removeEventListener("keydown",reset);
}
