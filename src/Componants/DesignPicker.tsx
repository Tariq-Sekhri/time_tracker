/**
 * DesignPicker: switch between candidate UI designs live in the running app, so they
 * can be compared on real data instead of in mockups.
 *
 * How it was used for the calendar's left "Sources" sidebar (Oct 2026):
 *
 *  1. Every candidate was its own component, all fed from one shared model. The sidebar's
 *     categories, devices, manual projects and Google calendars were normalised into a
 *     `SidebarSection[]` (see Screens/Calander/LeftSideBar.tsx), so every design drove
 *     exactly the same toggles and only the presentation differed.
 *
 *  2. The options were declared once and the current pick read with the hook:
 *
 *         const SIDEBAR_DESIGNS = [
 *             {id: "1", hint: "Colour icons, click a row for both"},
 *             {id: "2", hint: "Original: a card per source"},
 *         ] as const;
 *         const [design, setDesign] = useDesignOption("left-sidebar", SIDEBAR_DESIGNS, "1");
 *
 *  3. The picker went anywhere in the tree (it pins itself bottom-left) and the pick
 *     chose what to render:
 *
 *         <DesignPicker label="sidebar" options={SIDEBAR_DESIGNS} value={design} onChange={setDesign}/>
 *         {design === "1" ? <NewSidebar/> : <OldSidebar/>}
 *
 *  4. Rounds of feedback added, removed and renumbered options ("keep 2 and 6, make two
 *     more off each", "2a is the new 1", ...). Ids are plain strings, so "1a" / "2b"
 *     style names work. When ids changed meaning, the `storageKey` got a version suffix
 *     ("left-sidebar.v2") so a saved pick couldn't silently land on a different design.
 *     Keeping the original design as an option until the end made old-vs-new easy.
 *
 *  5. Once one design won, the losers, the picker and the hook call were deleted.
 *
 * Dev only: in a packaged build the picker renders nothing and the hook always returns
 * the default, so a forgotten picker can't ship or leak a stale choice to users.
 */

import {useState} from "react";

export type DesignOption<T extends string> = {
    id: T;
    /** Shown as the button's tooltip; say what makes this design different. */
    hint?: string;
};

/** The selected design for `storageKey`, persisted across reloads in a dev build only. */
export function useDesignOption<T extends string>(
    storageKey: string,
    options: readonly DesignOption<T>[],
    defaultId: T,
): [T, (id: T) => void] {
    const key = `time-tracker:dev.design.${storageKey}`;
    const [id, setId] = useState<T>(() => {
        if (!import.meta.env.DEV) return defaultId;
        const saved = localStorage.getItem(key);
        return options.find((o) => o.id === saved)?.id ?? defaultId;
    });
    return [id, (next) => {
        localStorage.setItem(key, next);
        setId(next);
    }];
}

/** Dev-only switch between designs, pinned bottom-left; renders nothing in a packaged build. */
export function DesignPicker<T extends string>({label, options, value, onChange}: {
    /** What is being compared, e.g. "sidebar". */
    label: string;
    options: readonly DesignOption<T>[];
    value: T;
    onChange: (id: T) => void;
}) {
    if (!import.meta.env.DEV) return null;
    return (
        // Stop clicks reaching whatever the picker happens to be rendered inside.
        <div className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-950/95 px-2 py-1 shadow-lg"
             title={`Dev only: which ${label} design to show`} onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
            <div className="flex gap-0.5" role="radiogroup" aria-label={`${label} design`}>
                {options.map((o) => (
                    <button key={o.id} type="button" role="radio" aria-checked={value === o.id} title={o.hint}
                            onClick={() => onChange(o.id)}
                            className={`h-6 min-w-6 rounded px-1 text-xs font-medium transition-colors ${value === o.id ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
                        {o.id}
                    </button>
                ))}
            </div>
        </div>
    );
}
