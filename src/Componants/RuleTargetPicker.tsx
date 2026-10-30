import {useEffect, useRef, useState} from "react";
import {categoryLabel, type Category} from "../api/Category.ts";
import type {CategoryRule} from "../api/CategoryRegex.ts";
import {manualCategoryLabel, nestManualCategories, type ManualCategory} from "../api/ManualProject.ts";

export type RuleTarget = {kind: "auto" | "manual"; id: number};

export function ruleTargetOf(rule: Pick<CategoryRule, "cat_id" | "manual_project_id">): RuleTarget | null {
    if (rule.cat_id != null) return {kind: "auto", id: rule.cat_id};
    return rule.manual_project_id != null ? {kind: "manual", id: rule.manual_project_id} : null;
}

export function ruleTargetFields(target: RuleTarget): Pick<CategoryRule, "cat_id" | "manual_project_id"> {
    return target.kind === "auto" ? {cat_id: target.id, manual_project_id: null} : {cat_id: null, manual_project_id: target.id};
}

export function ruleTargetLabel(target: RuleTarget | null, autoCategories: Category[], manualCategories: ManualCategory[]): string | undefined {
    if (!target) return undefined;
    if (target.kind === "auto") {
        const category = autoCategories.find((item) => item.id === target.id);
        return category && categoryLabel(category, autoCategories);
    }
    const category = manualCategories.find((item) => item.id === target.id);
    return category && manualCategoryLabel(category, manualCategories);
}

/** Picks the category a rule sends things to: an auto category or a manual one. */
export default function RuleTargetPicker({target, onChange, autoCategories, manualCategories, placeholder}: {
    target: RuleTarget | null;
    onChange: (target: RuleTarget) => void;
    autoCategories: Category[];
    manualCategories: ManualCategory[];
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const label = ruleTargetLabel(target, autoCategories, manualCategories);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node | null)) setOpen(false);
        };
        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    const option = (kind: RuleTarget["kind"], id: number, text: string, color: string | null | undefined) => (
        <button
            key={`${kind}-${id}`}
            type="button"
            onClick={() => {
                onChange({kind, id});
                setOpen(false);
            }}
            className={`flex items-center gap-3 w-full p-2 rounded text-left hover:bg-gray-800 ${
                target?.kind === kind && target.id === id ? "bg-gray-800" : ""
            }`}
        >
            {color && (
                <div
                    className="w-4 h-4 rounded border border-gray-600 shrink-0"
                    style={{backgroundColor: color}}
                />
            )}
            <span className="text-sm text-gray-200 flex-1 truncate">{text}</span>
        </button>
    );

    return (
        <div className="relative shrink-0 max-w-[14rem]" ref={rootRef}>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="min-h-9 w-full min-w-[10rem] max-w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white hover:bg-gray-700 flex items-center justify-between gap-2 text-left"
            >
                <span className={`truncate ${label ? "text-white" : "text-gray-400"}`}>{label ?? placeholder}</span>
                <svg
                    className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            {open && (
                <div className="absolute z-50 mt-2 left-0 w-64 max-h-[40vh] overflow-y-auto nice-scrollbar bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-2">
                    <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-gray-500">Auto</div>
                    {nestManualCategories(autoCategories).map((category) =>
                        option("auto", category.id, categoryLabel(category, autoCategories), category.color))}
                    <div className="px-2 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Manual</div>
                    {nestManualCategories(manualCategories).flatMap((category) => category.id == null ? [] : [
                        option("manual", category.id, manualCategoryLabel(category, manualCategories), category.color),
                    ])}
                    {manualCategories.every((category) => category.id == null) && (
                        <div className="px-2 py-1 text-sm text-gray-500">No manual categories yet</div>
                    )}
                </div>
            )}
        </div>
    );
}
