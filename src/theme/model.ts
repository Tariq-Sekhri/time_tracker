export const STORAGE_KEY = "time-tracker:themes:v1";
export const COLOR_FIELDS = [
  {
    "key": "app",
    "label": "App background",
    "group": "Surfaces",
    "default": "#000000"
  },
  {
    "key": "header",
    "label": "Navigation bar",
    "group": "Surfaces",
    "default": "#000000"
  },
  {
    "key": "sidebar",
    "label": "Sidebar",
    "group": "Surfaces",
    "default": "#000000"
  },
  {
    "key": "panel",
    "label": "Panels and cards",
    "group": "Surfaces",
    "default": "#111827"
  },
  {
    "key": "raised",
    "label": "Raised surfaces",
    "group": "Surfaces",
    "default": "#1f2937"
  },
  {
    "key": "deep",
    "label": "Inset surfaces",
    "group": "Surfaces",
    "default": "#030712"
  },
  {
    "key": "settings",
    "label": "Settings panels",
    "group": "Surfaces",
    "default": "#0d1421"
  },
  {
    "key": "input",
    "label": "Input background",
    "group": "Surfaces",
    "default": "#1f2937"
  },
  {
    "key": "dialog",
    "label": "Dialogs",
    "group": "Surfaces",
    "default": "#030712"
  },
  {
    "key": "tooltip",
    "label": "Tooltips",
    "group": "Surfaces",
    "default": "#111827"
  },
  {
    "key": "hover",
    "label": "Hover background",
    "group": "Surfaces",
    "default": "#374151"
  },
  {
    "key": "scrollTrack",
    "label": "Scrollbar track",
    "group": "Surfaces",
    "default": "#111827"
  },
  {
    "key": "scrollThumb",
    "label": "Scrollbar thumb",
    "group": "Surfaces",
    "default": "#6b7280"
  },
  {
    "key": "overlay",
    "label": "Modal backdrop",
    "group": "Surfaces",
    "default": "#00000099"
  },
  {
    "key": "text",
    "label": "Primary text",
    "group": "Text",
    "default": "#e5e7eb"
  },
  {
    "key": "heading",
    "label": "Headings",
    "group": "Text",
    "default": "#ffffff"
  },
  {
    "key": "secondary",
    "label": "Secondary text",
    "group": "Text",
    "default": "#d1d5db"
  },
  {
    "key": "muted",
    "label": "Muted text",
    "group": "Text",
    "default": "#9ca3af"
  },
  {
    "key": "subtle",
    "label": "Subtle text",
    "group": "Text",
    "default": "#6b7280"
  },
  {
    "key": "placeholder",
    "label": "Placeholder text",
    "group": "Text",
    "default": "#9ca3af"
  },
  {
    "key": "link",
    "label": "Links",
    "group": "Text",
    "default": "#60a5fa"
  },
  {
    "key": "onAccent",
    "label": "Text on primary buttons",
    "group": "Text",
    "default": "#ffffff"
  },
  {
    "key": "border",
    "label": "Standard borders",
    "group": "Borders",
    "default": "#374151"
  },
  {
    "key": "borderSubtle",
    "label": "Subtle borders",
    "group": "Borders",
    "default": "#222d3e"
  },
  {
    "key": "borderStrong",
    "label": "Strong borders",
    "group": "Borders",
    "default": "#4b5563"
  },
  {
    "key": "focus",
    "label": "Focus ring",
    "group": "Borders",
    "default": "#60a5fa"
  },
  {
    "key": "accent",
    "label": "Primary accent",
    "group": "Actions",
    "default": "#3b82f6"
  },
  {
    "key": "accentHover",
    "label": "Primary hover",
    "group": "Actions",
    "default": "#2563eb"
  },
  {
    "key": "accentStrong",
    "label": "Primary pressed / gradient",
    "group": "Actions",
    "default": "#1d4ed8"
  },
  {
    "key": "accentSoft",
    "label": "Selected background",
    "group": "Actions",
    "default": "#172554"
  },
  {
    "key": "accentText",
    "label": "Selected text",
    "group": "Actions",
    "default": "#bfdbfe"
  },
  {
    "key": "selection",
    "label": "Text selection",
    "group": "Actions",
    "default": "#2563eb80"
  },
  {
    "key": "success",
    "label": "Success / present",
    "group": "Status",
    "default": "#34d399"
  },
  {
    "key": "successBg",
    "label": "Success background",
    "group": "Status",
    "default": "#10312a"
  },
  {
    "key": "warning",
    "label": "Warning / away",
    "group": "Status",
    "default": "#fbbf24"
  },
  {
    "key": "warningBg",
    "label": "Warning background",
    "group": "Status",
    "default": "#35290f"
  },
  {
    "key": "danger",
    "label": "Error / destructive",
    "group": "Status",
    "default": "#f87171"
  },
  {
    "key": "dangerBg",
    "label": "Error background",
    "group": "Status",
    "default": "#450a0a"
  },
  {
    "key": "info",
    "label": "Information",
    "group": "Status",
    "default": "#38bdf8"
  },
  {
    "key": "infoBg",
    "label": "Information background",
    "group": "Status",
    "default": "#082f49"
  },
  {
    "key": "calendar",
    "label": "Calendar background",
    "group": "Calendar",
    "default": "#111827"
  },
  {
    "key": "calendarHeader",
    "label": "Calendar day header",
    "group": "Calendar",
    "default": "#1f2937"
  },
  {
    "key": "calendarText",
    "label": "Calendar labels",
    "group": "Calendar",
    "default": "#9ca3af"
  },
  {
    "key": "calendarGrid",
    "label": "Calendar grid",
    "group": "Calendar",
    "default": "#374151"
  },
  {
    "key": "calendarToday",
    "label": "Today highlight",
    "group": "Calendar",
    "default": "#ffffff0a"
  },
  {
    "key": "calendarNow",
    "label": "Current time indicator",
    "group": "Calendar",
    "default": "#ef4444"
  },
  {
    "key": "calendarDraft",
    "label": "Draft / selection block",
    "group": "Calendar",
    "default": "#0ea5e9"
  },
  {
    "key": "calendarDraftBorder",
    "label": "Draft outline",
    "group": "Calendar",
    "default": "#7dd3fc"
  },
  {
    "key": "eventText",
    "label": "Calendar event text",
    "group": "Calendar",
    "default": "#ffffff"
  },
  {
    "key": "afk",
    "label": "AFK block",
    "group": "Calendar",
    "default": "#78350f"
  },
  {
    "key": "afkBorder",
    "label": "AFK outline",
    "group": "Calendar",
    "default": "#f59e0b"
  },
  {
    "key": "afkText",
    "label": "AFK block text",
    "group": "Calendar",
    "default": "#fde68a"
  },
  {
    "key": "chartGrid",
    "label": "Chart grid",
    "group": "Charts",
    "default": "#374151"
  },
  {
    "key": "chartText",
    "label": "Chart labels",
    "group": "Charts",
    "default": "#9ca3af"
  },
  {
    "key": "chartTotal",
    "label": "Total trend line",
    "group": "Charts",
    "default": "#f3f4f6"
  },
  {
    "key": "chartUsage",
    "label": "Usage trend",
    "group": "Charts",
    "default": "#f97316"
  },
  {
    "key": "chartAxis",
    "label": "Chart axis / cursor",
    "group": "Charts",
    "default": "#4b5563"
  },
{"key":"chart1","label":"App series 1","group":"Charts","default":"#60a5fa"},
{"key":"chart2","label":"App series 2","group":"Charts","default":"#f472b6"},
{"key":"chart3","label":"App series 3","group":"Charts","default":"#34d399"},
{"key":"chart4","label":"App series 4","group":"Charts","default":"#fbbf24"},
{"key":"chart5","label":"App series 5","group":"Charts","default":"#a78bfa"},
{"key":"chart6","label":"App series 6","group":"Charts","default":"#fb923c"},
{"key":"chart7","label":"App series 7","group":"Charts","default":"#22d3ee"},
{"key":"chart8","label":"App series 8","group":"Charts","default":"#f87171"},
{"key":"chart9","label":"App series 9","group":"Charts","default":"#a3e635"},
{"key":"chart10","label":"App series 10","group":"Charts","default":"#c084fc"}] as const;
export type ColorKey = typeof COLOR_FIELDS[number]["key"];
export type Colors = Record<ColorKey, string>;
export type Theme = {id: string; name: string; mode: "dark" | "light"; baseId: string; colors: Colors};
export const DEFAULT_COLORS = Object.fromEntries(COLOR_FIELDS.map(f => [f.key, f.default])) as Colors;
function preset(id: string, name: string, mode: Theme["mode"], colors: Partial<Colors>): Theme {
    return {id, name, mode, baseId: id, colors: {...DEFAULT_COLORS, ...colors}};
}
function palette(app:string,panel:string,raised:string,text:string,muted:string,border:string,accent:string): Partial<Colors> {
    return {app,header:app,sidebar:app,panel,settings:panel,raised,deep:app,input:raised,dialog:panel,tooltip:panel,
        onAccent:contrastRatio("#ffffff",accent)!>=4.5?"#ffffff":app,hover:border,scrollTrack:panel,scrollThumb:muted,text,heading:text,secondary:text,muted,subtle:muted,placeholder:muted,
        border,borderSubtle:border,borderStrong:muted,focus:accent,accent,accentHover:accent,accentStrong:accent,link:accent,
        accentSoft:accent+"22",accentText:accent,selection:accent+"55",calendar:panel,calendarHeader:raised,calendarText:muted,
        calendarGrid:border,calendarToday:accent+"0c",calendarNow:accent,calendarDraft:accent,calendarDraftBorder:accent,
        chartGrid:border,chartText:muted,chartTotal:text,chartAxis:border};
}
export const PRESETS: Theme[] = [
    preset("dark", "Default dark", "dark", {}),
    preset("light", "Paper", "light", {...palette("#f4f5f7","#ffffff","#e9edf2","#1f2937","#64748b","#d1d5db","#2563eb"),
        success:"#047857",successBg:"#d1fae5",warning:"#92400e",warningBg:"#fef3c7",danger:"#b91c1c",dangerBg:"#fee2e2",info:"#0369a1",infoBg:"#e0f2fe",afk:"#fef3c7",afkText:"#78350f",afkBorder:"#d97706"}),
    preset("midnight", "Midnight", "dark", palette("#0b1020","#141b32","#1d2846","#e0e7ff","#94a3c4","#334265","#818cf8")),
    preset("nord", "Nord", "dark", palette("#242933","#2e3440","#3b4252","#eceff4","#a5b1c2","#4c566a","#88c0d0")),
    preset("forest", "Forest", "dark", palette("#0b1410","#14231c","#1d3328","#e4f2e9","#97b5a4","#345142","#4ade80")),
    preset("rose", "Rose", "dark", palette("#1b1018","#291c26","#3b2937","#fce7f3","#c5a3b8","#5c4052","#f472b6")),
];
export function normalizeColor(value: unknown): string | null {
    if(typeof value !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return null;
    return (value.length <= 5 ? "#" + [...value.slice(1)].map(c=>c+c).join("") : value).toLowerCase();
}
export function parseTheme(value: unknown): Theme {
    if(!value || typeof value !== "object") throw new Error("Choose a theme JSON object.");
    const input = value as Record<string, unknown>;
    if(typeof input.name !== "string" || !input.name.trim() || input.name.length > 80) throw new Error("Theme name must contain 1-80 characters.");
    if(input.mode !== "dark" && input.mode !== "light") throw new Error("Theme mode must be dark or light.");
    if(!input.colors || typeof input.colors !== "object" || Array.isArray(input.colors)) throw new Error("Theme colors must be an object.");
    const baseId = PRESETS.some(p=>p.id === input.baseId) ? String(input.baseId) : "dark";
    const colors = {...PRESETS.find(p=>p.id === baseId)!.colors};
    for(const [key,value] of Object.entries(input.colors)) {
        if(!COLOR_FIELDS.some(f=>f.key === key)) throw new Error(`Unknown color: ${key}`);
        const normalized = normalizeColor(value);
        if(!normalized) throw new Error(`Invalid color for ${key}. Use a hex color such as #2563eb or #2563eb80.`);
        colors[key as ColorKey] = normalized;
    }
    return {id: typeof input.id === "string" && /^custom-[a-z0-9-]{1,80}$/i.test(input.id) ? input.id : "custom-"+crypto.randomUUID(), name:input.name.trim(),mode:input.mode,baseId,colors};
}
export function applyTheme(theme:Theme, root:HTMLElement = document.documentElement) {
    for(const field of COLOR_FIELDS) root.style.setProperty(`--tt-${field.key}`, theme.colors[field.key]);
    root.style.colorScheme = theme.mode;
    root.dataset.theme = theme.id;
}
export function contrastRatio(a:string,b:string):number | null {
    if(a.length !== 7 || b.length !== 7) return null;
    const luminance=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
