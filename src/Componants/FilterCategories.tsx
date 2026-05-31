import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import {createPortal} from "react-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {Category, get_categories, update_category_by_id} from "../api/Category.ts";

export type CategoryEnabledField = "regex_enabled" | "calendar_enabled";

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

export function useFilterCategories(categories: Category[], enabledField: CategoryEnabledField) {
    const queryClient = useQueryClient();

    const categoriesByPriority = useMemo(
        () => [...categories].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
        [categories]
    );

    const visibleCategoryIds = useMemo(() => {
        const ids = new Set<number>();
        for (const cat of categories) {
            if (cat[enabledField]) {
                ids.add(cat.id);
            }
        }
        return ids;
    }, [categories, enabledField]);

    const visibleCategoryNames = useMemo(() => {
        const names = new Set<string>();
        for (const cat of categories) {
            if (cat[enabledField]) {
                names.add(cat.name);
            }
        }
        return names;
    }, [categories, enabledField]);

    const patchCategoriesInCache = useCallback(
        (patch: (cat: Category) => Category) => {
            queryClient.setQueryData<Category[]>(["categories"], (old) =>
                old ? old.map(patch) : old
            );
        },
        [queryClient]
    );

    const persistCategories = useCallback(
        async (updated: Category[]) => {
            try {
                await Promise.all(updated.map((cat) => update_category_by_id(cat)));
            } catch {
                await queryClient.invalidateQueries({queryKey: ["categories"]});
            }
        },
        [queryClient]
    );

    const toggleVisibleCategory = useCallback(
        (catId: number) => {
            const cat = categories.find((c) => c.id === catId);
            if (!cat) return;
            const updated = {...cat, [enabledField]: !cat[enabledField]};
            patchCategoriesInCache((c) => (c.id === catId ? updated : c));
            void persistCategories([updated]);
        },
        [categories, enabledField, patchCategoriesInCache, persistCategories]
    );

    const checkAllCategories = useCallback(() => {
        const updated = categories.filter((c) => !c[enabledField]).map((c) => ({...c, [enabledField]: true}));
        if (updated.length === 0) return;
        patchCategoriesInCache((c) => ({...c, [enabledField]: true}));
        void persistCategories(updated);
    }, [categories, enabledField, patchCategoriesInCache, persistCategories]);

    const uncheckAllCategories = useCallback(() => {
        const updated = categories.filter((c) => c[enabledField]).map((c) => ({...c, [enabledField]: false}));
        if (updated.length === 0) return;
        patchCategoriesInCache((c) => ({...c, [enabledField]: false}));
        void persistCategories(updated);
    }, [categories, enabledField, patchCategoriesInCache, persistCategories]);

    return {
        visibleCategoryIds,
        visibleCategoryNames,
        categoriesByPriority,
        toggleVisibleCategory,
        checkAllCategories,
        uncheckAllCategories,
    };
}

type FilterCategoriesPanelProps = {
    isOpen: boolean;
    setIsOpen?: Dispatch<SetStateAction<boolean>>;
    onOpenChange?: (open: boolean) => void;
    categories: Category[];
    categoriesByPriority: Category[];
    enabledField: CategoryEnabledField;
    filterRef?: RefObject<HTMLDivElement | null>;
    panelRef?: RefObject<HTMLDivElement | null>;
    onToggle: (catId: number) => void;
    onCheckAll: () => void;
    onUncheckAll: () => void;
    onCloseOtherMenus?: () => void;
};

function FilterCategoriesPanel({
    isOpen,
    setIsOpen,
    onOpenChange,
    categories,
    categoriesByPriority,
    enabledField,
    filterRef: filterRefProp,
    panelRef: panelRefProp,
    onToggle,
    onCheckAll,
    onUncheckAll,
    onCloseOtherMenus,
}: FilterCategoriesPanelProps) {
    const internalFilterRef = useRef<HTMLDivElement | null>(null);
    const internalPanelRef = useRef<HTMLDivElement | null>(null);
    const filterRef = filterRefProp ?? internalFilterRef;
    const panelRef = panelRefProp ?? internalPanelRef;

    const triggerRef = useRef<HTMLButtonElement>(null);
    const [panelStyle, setPanelStyle] = useState<CSSProperties>({
        position: "fixed",
        visibility: "hidden",
    });

    const enabledCount = useMemo(
        () => categories.filter((c) => c[enabledField]).length,
        [categories, enabledField]
    );

    const setOpen = useCallback((open: boolean) => {
        if (onOpenChange) {
            onOpenChange(open);
        } else if (setIsOpen) {
            setIsOpen(open);
        }
    }, [onOpenChange, setIsOpen]);

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

    useEffect(() => {
        if (!isOpen) return;

        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            const inTrigger = filterRef.current?.contains(target);
            const inPanel = panelRef.current?.contains(target);
            if (!inTrigger && !inPanel) {
                setOpen(false);
            }
        };

        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [isOpen, filterRef, panelRef, setOpen]);

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
                {categoriesByPriority.map((cat) => (
                    <label
                        key={cat.id}
                        className="flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            checked={cat[enabledField]}
                            onChange={() => onToggle(cat.id)}
                            className="w-4 h-4 rounded cursor-pointer"
                        />
                        {cat.color && (
                            <div
                                className="w-4 h-4 rounded border border-gray-600 shrink-0"
                                style={{backgroundColor: cat.color}}
                            />
                        )}
                        <span className="text-sm text-gray-200 flex-1">{cat.name}</span>
                    </label>
                ))}
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
                    setOpen(!isOpen);
                }}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white hover:bg-gray-700 flex items-center gap-2"
            >
                <span>
                    Filter categories ({enabledCount}/{categories.length || 0})
                </span>
                <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            {panel && createPortal(panel, document.body)}
        </div>
    );
}

type FilterCategoriesProps = {
    enabledField: CategoryEnabledField;
    isOpen: boolean;
    setIsOpen?: Dispatch<SetStateAction<boolean>>;
    onOpenChange?: (open: boolean) => void;
    categories?: Category[];
    categoriesByPriority?: Category[];
    filterRef?: RefObject<HTMLDivElement | null>;
    panelRef?: RefObject<HTMLDivElement | null>;
    onToggle?: (catId: number) => void;
    onCheckAll?: () => void;
    onUncheckAll?: () => void;
    onCloseOtherMenus?: () => void;
};

function FilterCategoriesWithState({
    enabledField,
    isOpen,
    setIsOpen,
    onOpenChange,
    onCloseOtherMenus,
}: Pick<FilterCategoriesProps, "enabledField" | "isOpen" | "setIsOpen" | "onOpenChange" | "onCloseOtherMenus">) {
    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const filter = useFilterCategories(categories, enabledField);

    return (
        <FilterCategoriesPanel
            isOpen={isOpen}
            setIsOpen={setIsOpen}
            onOpenChange={onOpenChange}
            categories={categories}
            categoriesByPriority={filter.categoriesByPriority}
            enabledField={enabledField}
            onToggle={filter.toggleVisibleCategory}
            onCheckAll={filter.checkAllCategories}
            onUncheckAll={filter.uncheckAllCategories}
            onCloseOtherMenus={onCloseOtherMenus}
        />
    );
}

export default function FilterCategories({
    enabledField,
    isOpen,
    setIsOpen,
    onOpenChange,
    categories: categoriesProp,
    categoriesByPriority: categoriesByPriorityProp,
    filterRef,
    panelRef,
    onToggle,
    onCheckAll,
    onUncheckAll,
    onCloseOtherMenus,
}: FilterCategoriesProps) {
    if (onToggle === undefined) {
        return (
            <FilterCategoriesWithState
                enabledField={enabledField}
                isOpen={isOpen}
                setIsOpen={setIsOpen}
                onOpenChange={onOpenChange}
                onCloseOtherMenus={onCloseOtherMenus}
            />
        );
    }

    return (
        <FilterCategoriesPanel
            isOpen={isOpen}
            setIsOpen={setIsOpen}
            onOpenChange={onOpenChange}
            categories={categoriesProp ?? []}
            categoriesByPriority={categoriesByPriorityProp ?? []}
            enabledField={enabledField}
            filterRef={filterRef}
            panelRef={panelRef}
            onToggle={onToggle}
            onCheckAll={onCheckAll!}
            onUncheckAll={onUncheckAll!}
            onCloseOtherMenus={onCloseOtherMenus}
        />
    );
}
