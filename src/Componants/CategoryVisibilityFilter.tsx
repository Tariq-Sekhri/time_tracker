import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Category } from "../api/Category.ts";

type CategoryVisibilityFilterProps = {
    categories: Category[];
    categoriesByPriority: Category[];
    visibleCategoryIds: Set<number>;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    filterRef: RefObject<HTMLDivElement | null>;
    panelRef: RefObject<HTMLDivElement | null>;
    onToggle: (catId: number) => void;
    onCheckAll: () => void;
    onUncheckAll: () => void;
    onCloseOtherMenus?: () => void;
};

const VIEWPORT_PAD = 12;
const PANEL_MAX_WIDTH = 700;
const GAP = 8;

function computePanelStyle(trigger: DOMRect): CSSProperties {
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
    let left = trigger.left;
    if (left + width > window.innerWidth - VIEWPORT_PAD) {
        left = window.innerWidth - VIEWPORT_PAD - width;
    }
    if (left < VIEWPORT_PAD) {
        left = VIEWPORT_PAD;
    }

    const spaceBelow = window.innerHeight - trigger.bottom - VIEWPORT_PAD;
    const spaceAbove = trigger.top - VIEWPORT_PAD;
    const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;

    if (openBelow) {
        const maxHeight = Math.min(window.innerHeight * 0.5, Math.max(120, spaceBelow - GAP));
        return {
            position: "fixed",
            left,
            top: trigger.bottom + GAP,
            width,
            maxHeight,
            zIndex: 9999,
        };
    }

    const maxHeight = Math.min(window.innerHeight * 0.5, Math.max(120, spaceAbove - GAP));
    return {
        position: "fixed",
        left,
        bottom: window.innerHeight - trigger.top + GAP,
        width,
        maxHeight,
        zIndex: 9999,
    };
}

export default function CategoryVisibilityFilter({
    categories,
    categoriesByPriority,
    visibleCategoryIds,
    isOpen,
    onOpenChange,
    filterRef,
    panelRef,
    onToggle,
    onCheckAll,
    onUncheckAll,
    onCloseOtherMenus,
}: CategoryVisibilityFilterProps) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [panelStyle, setPanelStyle] = useState<CSSProperties>({
        position: "fixed",
        visibility: "hidden",
    });

    useLayoutEffect(() => {
        if (!isOpen) return;

        const update = () => {
            const btn = triggerRef.current;
            if (!btn) return;
            setPanelStyle({
                ...computePanelStyle(btn.getBoundingClientRect()),
                visibility: "visible",
            });
        };

        update();
        const raf = requestAnimationFrame(update);
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [isOpen, categories.length]);

    const panel = isOpen ? (
        <div
            ref={panelRef}
            style={panelStyle}
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-3 flex flex-col min-h-0"
        >
            <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
                <div className="text-sm font-medium text-gray-200">Categories</div>
                <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onCheckAll}
                                className="px-2.5 py-1 text-sm text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded transition-colors"
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={onUncheckAll}
                                className="px-2.5 py-1 text-sm text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded transition-colors"
                            >
                                None
                            </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-auto nice-scrollbar pr-1 min-h-0 flex-1">
                {categoriesByPriority.map((cat) => {
                    const checked = visibleCategoryIds.has(cat.id);
                    return (
                        <label
                            key={cat.id}
                            className="flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggle(cat.id)}
                                className="w-4 h-4 rounded cursor-pointer"
                            />
                            {cat.color && (
                                <div
                                    className="w-4 h-4 rounded border border-gray-600 shrink-0"
                                    style={{ backgroundColor: cat.color }}
                                />
                            )}
                            <span className="text-sm text-gray-200 flex-1">{cat.name}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    ) : null;

    return (
        <div className="relative" ref={filterRef}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => {
                    onCloseOtherMenus?.();
                    onOpenChange(!isOpen);
                }}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white hover:bg-gray-700 flex items-center gap-2"
            >
                <span>
                    Filter categories ({visibleCategoryIds.size}/{categories.length || 0})
                </span>
                <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {panel && createPortal(panel, document.body)}
        </div>
    );
}
