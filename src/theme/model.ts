export const STORAGE_KEY = "time-tracker:themes:v1";
export const COLOR_FIELDS = [
  {key:"disabledText",label:"Disabled source text and icons",group:"Text",default:"#4b5563"},
  {key:"googleFallback",label:"Default calendar color",group:"Calendar",default:"#4285f4"},
  {key:"sourceControls",label:"Source toggle color",group:"Context",default:"#94a3b8"},
  {key:"subtleSurface",label:"Subtle surface",group:"Context",default:"#0d1421"},
  {key:"highlightSurface",label:"Highlight surface",group:"Context",default:"#172554"},
  {key:"action",label:"Action",group:"Context",default:"#3b82f6"},
  {key:"messageSurface",label:"Message surface",group:"Context",default:"#111827"},
  {key:"codeSurface",label:"Code surface",group:"Context",default:"#030712"},
  {key:"sidebarControls",label:"Sidebar controls",group:"Context",default:"#1f2937"},
  {key:"sidebarSelection",label:"Sidebar selection",group:"Context",default:"#172554"},

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
export type Theme = {id: string; name: string; mode: "dark" | "light"; baseId: string; colors: Colors; brightness?: number};
export const DEFAULT_COLORS = Object.fromEntries(COLOR_FIELDS.map(f => [f.key, f.default])) as Colors;
function preset(id: string, name: string, mode: Theme["mode"], colors: Partial<Colors>): Theme {
    return {id, name, mode, baseId: id, colors: {...DEFAULT_COLORS, ...colors}};
}
function palette(app:string,panel:string,raised:string,text:string,muted:string,border:string,accent:string): Partial<Colors> {
    return {app,header:app,sidebar:app,panel,settings:panel,raised,deep:app,input:raised,dialog:panel,tooltip:panel,
        disabledText:muted,subtleSurface:panel,highlightSurface:accent+"22",action:accent,messageSurface:panel,codeSurface:app,sidebarControls:raised,sidebarSelection:accent+"22",
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
    preset("nord", "Lime", "dark", palette("#151d09","#253412","#384e18","#effbd4","#abc47b","#56762b","#b1ed48")),
    preset("forest", "Forest", "dark", palette("#0b1410","#14231c","#1d3328","#e4f2e9","#97b5a4","#345142","#4ade80")),
    preset("rose", "Cherry", "dark", palette("#260d15","#401523","#5c2133","#ffe1e9","#d591a6","#8b354f","#ff527f")),
];
export const THEME_FAMILIES = [
    {name:"Original", light:"light", dark:"dark"},
    {name:"T3 Code", light:"t3-code-light", dark:"t3-code"},
    {name:"Plum", light:"t3-chat-light", dark:"t3-chat"},
    {name:"Grove", light:"grove-light", dark:"forest"},
    {name:"Electric", light:"ocean-light", dark:"ocean"},
    {name:"Blaze", light:"ember-light", dark:"ember"},
    {name:"Ultraviolet", light:"dusk-light", dark:"dusk"},
    {name:"Lime", light:"nord-light", dark:"nord"},
    {name:"Midnight", light:"midnight-light", dark:"midnight"},
    {name:"Cherry", light:"rose-light", dark:"rose"},
    {name:"Matrix", light:"teal-light", dark:"teal"},
    {name:"Volt", light:"amber-light", dark:"amber"},
    {name:"Acid", light:"sage-light", dark:"sage"},
    {name:"Bubblegum", light:"lavender-light", dark:"lavender"},
    {name:"Crimson", light:"terracotta-light", dark:"terracotta"},
    {name:"Cobalt", light:"slate-light", dark:"slate"},
    {name:"Magenta", light:"coral-light", dark:"coral"},
    {name:"Arcade", light:"aqua-light", dark:"aqua"},
    {name:"Solar", light:"sand-light", dark:"sand"},
];
const PALETTE_ORDER = [
    "dark", "midnight", "aqua", "slate", "ocean", "teal",
    "forest", "nord", "sage", "amber", "sand", "ember",
    "terracotta", "t3-chat", "rose", "coral", "lavender", "dusk",
];
export const PICKER_FAMILIES = PALETTE_ORDER.map(id=>THEME_FAMILIES.find(f=>f.dark===id)!);
const additions: [string,string,string,string,string,string,string,string,string][] = [
    ["t3-code","T3 Code","#101114","#191b22","#242732","#e4e4ef","#9b9dad","#333645","#9388ef"],
    ["t3-chat","Plum","#1c101b","#281622","#3a2032","#f4daeb","#be99b2","#533347","#d962a7"],
    ["ocean","Electric","#00132b","#00264a","#004374","#e0ffff","#77cfe8","#007ca8","#00e5ff"],
    ["ember","Blaze","#2b0900","#501300","#7b2600","#fff0d9","#f3b16b","#bf4b00","#ff7900"],
    ["dusk","Ultraviolet","#16003b","#2d006a","#48009c","#f5e4ff","#c390ff","#8335dc","#bb55ff"],
    ["teal","Matrix","#001408","#002b13","#004921","#d9ffe2","#71d591","#0a8041","#00ff68"],
    ["amber","Volt","#151600","#2d3000","#494e00","#fcffcd","#c8d15f","#818c00","#edff00"],
    ["sage","Acid","#190329","#30064d","#4b0d70","#f5ffe0","#c0d86e","#7841a0","#c8ff00"],
    ["lavender","Bubblegum","#2b0026","#4c0045","#73006d","#ffe4ff","#f190e6","#b02ca2","#ff54de"],
    ["terracotta","Crimson","#2c0010","#50001c","#79072b","#ffe4ec","#f29bb6","#bb2351","#ff2859"],
    ["slate","Cobalt","#0c1632","#142550","#203b78","#e0eaff","#91aee5","#355d9b","#6499ff"],
    ["coral","Magenta","#260c29","#401345","#5d2064","#ffe0ff","#d18cce","#873b89","#ee60e7"],
    ["aqua","Arcade","#10104b","#202078","#3434a6","#ffffdf","#a9afff","#5b62d8","#fff000"],
    ["sand","Solar","#291900","#4b2c00","#704300","#fff5c7","#e3b866","#ad7400","#ffcc00"],
];
for(const [id,name,...values] of additions) PRESETS.push(preset(id,name,"dark",palette(...values as [string,string,string,string,string,string,string])));
const lightPalettes = [
    ["#f5f5fa","#ffffff","#e9e9f2","#272735","#717185","#d6d6e3","#6553bb"],
    ["#faf2f7","#fffafd","#f1e2ed","#392534","#886b7e","#e2cbd9","#a33b79"],
    ["#f0f5ed","#fcfdf8","#e2ecdc","#26392c","#657d66","#c8d6c1","#2c704c"],
    ["#e0fbff","#f5feff","#b8f1ff","#002c4c","#366d85","#68cce6","#006ca8"],
    ["#fff0d9","#fffaf2","#ffd59c","#602400","#986022","#f0a34d","#b83a00"],
    ["#f2e1ff","#fcf5ff","#dfb5ff","#420e6d","#8854a6","#bc75ec","#8c13d1"],
    ["#f3f9e6","#fcfff4","#e3efc7","#2e4016","#71874c","#c7dba5","#597c12"],
    ["#eef0fa","#fafbff","#e1e5f5","#252d4d","#67769c","#c9d0e6","#4f5ab7"],
    ["#fff0f3","#fff9fb","#ffdbe5","#641f34","#a35d74","#efb8c9","#c82453"],
    ["#e1ffea","#f5fff8","#b4f6c9","#003c1c","#397950","#65cf91","#007b35"],
    ["#faffbf","#fefff0","#eff782","#343b00","#727c2a","#c1d133","#657500"],
    ["#f2ffd4","#fcfff0","#dcf59a","#34204c","#6f6b35","#b3ca57","#6630ac"],
    ["#ffe4f9","#fff7fd","#ffb9eb","#641457","#a45691","#ee83d0","#ba188c"],
    ["#ffe6ed","#fff7fa","#ffbacd","#690d2b","#a14c69","#ed779a","#c6003e"],
    ["#edf3ff","#f9fbff","#dbe7ff","#1b3560","#5e7ba8","#baceed","#235dc4"],
    ["#fff0ff","#fffaff","#f9d9f7","#5a215c","#9a5e98","#e8b5e4","#ae2da5"],
    ["#eeeeff","#fafaff","#d0d1ff","#24205c","#68639a","#9a99ed","#6c20dc"],
    ["#fff6c7","#fffdea","#ffe78a","#512a00","#8a681c","#e7bd41","#9b4f00"],
] as const;
THEME_FAMILIES.slice(1).forEach((family,index)=>{
    const [app,panel,raised,text,muted,border,accent]=lightPalettes[index];
    PRESETS.push(preset(family.light,family.name+" light","light",{
        ...palette(app,panel,raised,text,muted,border,accent),
        success:"#047857",successBg:"#d1fae5",warning:"#92400e",warningBg:"#fef3c7",danger:"#b91c1c",dangerBg:"#fee2e2",info:"#0369a1",infoBg:"#e0f2fe",
        afk:"#fef3c7",afkText:"#78350f",afkBorder:"#d97706",
    }));
});
function superDark(text:string,muted:string,border:string,accent:string): Partial<Colors> {
    return {...palette("#000000","#000000","#000000",text,muted,border,accent),
        disabledText:"#85858d",borderStrong:border,hover:"#000000",scrollThumb:border,
        action:"#000000",accentHover:"#000000",accentStrong:"#000000",onAccent:text,
        accentSoft:"#000000",highlightSurface:"#000000",
        // Source toggles use aria-pressed for visibility, not a filled selection row.
        sidebarControls:"#00000000",sidebarSelection:"#00000000",
        successBg:"#000000",warningBg:"#000000",dangerBg:"#000000",infoBg:"#000000",
        afk:"#000000",afkBorder:"#30200b",afkText:"#b39b75",
    };
}
// Keep older palettes available to saved themes without filling the picker with light variants.
PRESETS.push(
    preset("oled", "OLED", "dark", superDark("#c6c6cc","#707075","#080808","#888890")),
    preset("obsidian", "Obsidian", "dark", superDark("#c7c3ce","#77717f","#0b0910","#9783b0")),
    preset("deep-forest", "Deep Forest", "dark", superDark("#c2cdc6","#6c8174","#080e0a","#729984")),
    preset("black-cherry", "Black Cherry", "dark", superDark("#d0c1ca","#886e7e","#10080c","#af7d99")),
);
export const INCLUDED_PRESETS = PRESETS.filter(theme => theme.id!=="t3-code" && (theme.mode === "dark" || theme.id === "light" || theme.id === "ocean-light"));
export function themeFamily(theme: Theme) {
    return THEME_FAMILIES.find(f => f.dark === theme.baseId || f.light === theme.baseId) ?? THEME_FAMILIES[0];
}
export function themeBrightness(theme: Theme) {
    return theme.brightness ?? (theme.mode === "light" ? 100 : ["oled","obsidian","deep-forest","black-cherry"].includes(theme.baseId) ? 10 : 35);
}
/** Always blend from fixed endpoints so dragging back restores the exact palette. */
export function withBrightness(theme: Theme, value: number): Theme {
    const brightness = Math.max(0, Math.min(100, value));
    const family = themeFamily(theme);
    const dark = PRESETS.find(p => p.id === family.dark)!;
    const light = PRESETS.find(p => p.id === family.light)!;
    const legacyId = family.dark === "forest" ? "deep-forest" : family.dark === "rose" || family.dark === "t3-chat" ? "black-cherry" : family.dark === "dusk" ? "obsidian" : "oled";
    const legacy = PRESETS.find(p=>p.id===legacyId)!;
    const ultra = {...dark.colors,...superDark(legacy.colors.text,legacy.colors.muted,legacy.colors.border,legacyId==="oled" ? dark.colors.muted : legacy.colors.accent)};
    const deepest = {...ultra,text:"#a0a0a8",heading:"#b5b5bd",secondary:"#898991",muted:"#606068",accent:legacy.colors.accent};
    const from = brightness<=10 ? deepest : brightness<=35 ? ultra : dark.colors;
    const to = brightness<=10 ? ultra : brightness<=35 ? dark.colors : light.colors;
    const amount = brightness<=10 ? brightness/10 : brightness<=35 ? (brightness-10)/25 : (brightness-35)/65;
    const blend = (a: string, b: string) => {
        if(amount===0)return a;
        if(amount===1)return b;
        const channels = [1,3,5].map(i => Math.round(parseInt(a.slice(i,i+2),16)*(1-amount)+parseInt(b.slice(i,i+2),16)*amount).toString(16).padStart(2,"0"));
        const alpha = a.length===9 || b.length===9 ? Math.round(parseInt(a.slice(7)||"ff",16)*(1-amount)+parseInt(b.slice(7)||"ff",16)*amount).toString(16).padStart(2,"0") : "";
        return "#"+channels.join("")+alpha;
    };
    const colors = Object.fromEntries(COLOR_FIELDS.map(f => [f.key,blend(from[f.key],to[f.key])])) as Colors;
    // Keep text legible while surfaces move through the middle of the range.
    if(brightness>35 && brightness<100) {
        const foreground = contrastRatio(dark.colors.text,colors.panel)! >= contrastRatio(light.colors.text,colors.panel)! ? dark : light;
        for(const field of COLOR_FIELDS) {
            if(field.group === "Text" || ["calendarText","eventText","chartText","disabledText"].includes(field.key)) colors[field.key] = foreground.colors[field.key];
        }
        if(contrastRatio(colors.text,colors.panel)!<4.5) {
            const text=contrastRatio("#000000",colors.panel)!>contrastRatio("#ffffff",colors.panel)!?"#000000":"#ffffff";
            colors.text=text;colors.heading=text;
        }
    }
    return {...theme,baseId:family.dark,brightness,mode:brightness<68?"dark":"light",colors};
}
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
    return {id: typeof input.id === "string" && /^custom-[a-z0-9-]{1,80}$/i.test(input.id) ? input.id : "custom-"+crypto.randomUUID(), name:input.name.trim(),mode:input.mode,baseId,colors,...(typeof input.brightness === "number" && Number.isFinite(input.brightness) ? {brightness:Math.max(0,Math.min(100,input.brightness))} : {})};
}
export function applyTheme(theme:Theme, root:HTMLElement = document.documentElement) {
    for(const field of COLOR_FIELDS) root.style.setProperty(`--tt-${field.key}`, theme.colors[field.key]);
    root.dataset.themeColorOverrides = ["disabledText","subtleSurface","highlightSurface","action","messageSurface","codeSurface","sidebarControls","sidebarSelection"].filter(key=>theme.colors[key as ColorKey]!==DEFAULT_COLORS[key as ColorKey]).join(" ");
    root.style.colorScheme = theme.mode;
    root.dataset.theme = theme.id;
}
export function contrastRatio(a:string,b:string):number | null {
    if(a.length !== 7 || b.length !== 7) return null;
    const luminance=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
