import { useEffect, useMemo, useRef, useState } from "react";
import { Category } from "../api/Category.ts";
import { getAppMetadata, setAppMetadata } from "../api/appMetadata.ts";
import { KNOWN_CATEGORY_IDS_KEY, VISIBLE_CATEGORY_IDS_KEY } from "../categoryVisibility.ts";

export function useVisibleCategoryFilter(categories: Category[]) {
    const [visibleCategoryIds, setVisibleCategoryIds] = useState<Set<number>>(new Set());
    const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
    const categoryFilterRef = useRef<HTMLDivElement | null>(null);
    const categoryFilterPanelRef = useRef<HTMLDivElement | null>(null);
    const hasInitializedVisibleCategories = useRef(false);

    const categoriesByPriority = useMemo(
        () => [...categories].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
        [categories]
    );

    const visibleCategoryNames = useMemo(() => {
        const names = new Set<string>();
        for (const cat of categories) {
            if (visibleCategoryIds.has(cat.id)) {
                names.add(cat.name);
            }
        }
        return names;
    }, [categories, visibleCategoryIds]);

    useEffect(() => {
        if (categories.length === 0 || hasInitializedVisibleCategories.current) {
            return;
        }

        const allIds = categories.map((c) => c.id);
        Promise.all([
            getAppMetadata(VISIBLE_CATEGORY_IDS_KEY),
            getAppMetadata(KNOWN_CATEGORY_IDS_KEY),
        ])
            .then(([savedVisibleRaw, savedKnownRaw]) => {
                if (savedVisibleRaw) {
                    const savedVisible = new Set<number>(JSON.parse(savedVisibleRaw) as number[]);
                    const savedKnown = savedKnownRaw ? new Set<number>(JSON.parse(savedKnownRaw) as number[]) : null;

                    const merged = new Set<number>();
                    for (const id of allIds) {
                        if (savedVisible.has(id)) {
                            merged.add(id);
                            continue;
                        }
                        if (savedKnown && savedKnown.has(id)) {
                            continue;
                        }
                        merged.add(id);
                    }

                    setVisibleCategoryIds(merged);
                    setAppMetadata(KNOWN_CATEGORY_IDS_KEY, JSON.stringify(allIds)).catch(() => {});
                } else {
                    const allVisible = new Set<number>(allIds);
                    setVisibleCategoryIds(allVisible);
                    setAppMetadata(VISIBLE_CATEGORY_IDS_KEY, JSON.stringify([...allVisible])).catch(() => {});
                    setAppMetadata(KNOWN_CATEGORY_IDS_KEY, JSON.stringify(allIds)).catch(() => {});
                }
            })
            .catch(() => {
                setVisibleCategoryIds(new Set<number>(allIds));
            });

        hasInitializedVisibleCategories.current = true;
    }, [categories]);

    useEffect(() => {
        if (!isCategoryFilterOpen) return;

        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            const inTrigger = categoryFilterRef.current?.contains(target);
            const inPanel = categoryFilterPanelRef.current?.contains(target);
            if (!inTrigger && !inPanel) {
                setIsCategoryFilterOpen(false);
            }
        };

        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [isCategoryFilterOpen]);

    useEffect(() => {
        if (!hasInitializedVisibleCategories.current || categories.length === 0) {
            return;
        }
        setAppMetadata(VISIBLE_CATEGORY_IDS_KEY, JSON.stringify([...visibleCategoryIds])).catch(() => {});
        setAppMetadata(KNOWN_CATEGORY_IDS_KEY, JSON.stringify(categories.map((c) => c.id))).catch(() => {});
    }, [visibleCategoryIds, categories]);

    const toggleVisibleCategory = (catId: number) => {
        setVisibleCategoryIds((prev) => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId);
            else next.add(catId);
            return next;
        });
    };

    const checkAllCategories = () => {
        setVisibleCategoryIds(new Set(categories.map((c) => c.id)));
    };

    const uncheckAllCategories = () => {
        setVisibleCategoryIds(new Set<number>());
    };

    return {
        visibleCategoryIds,
        visibleCategoryNames,
        categoriesByPriority,
        isCategoryFilterOpen,
        setIsCategoryFilterOpen,
        categoryFilterRef,
        categoryFilterPanelRef,
        toggleVisibleCategory,
        checkAllCategories,
        uncheckAllCategories,
    };
}
