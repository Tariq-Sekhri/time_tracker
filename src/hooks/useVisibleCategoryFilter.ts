import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Category } from "../api/Category.ts";
import { getAppMetadata, setAppMetadata } from "../api/appMetadata.ts";
import {
    KNOWN_CATEGORY_IDS_KEY,
    VISIBLE_CATEGORY_IDS_KEY,
    VISIBLE_CATEGORY_UNCHECKED_ALL_KEY,
} from "../categoryVisibility.ts";

type StoredPrefs = {
    visibleRaw: string | null;
    knownRaw: string | null;
    uncheckedAll: boolean;
};

let storedPrefsCache: StoredPrefs | null = null;
let storedPrefsPromise: Promise<StoredPrefs> | null = null;

function loadStoredPrefs(): Promise<StoredPrefs> {
    if (storedPrefsCache) {
        return Promise.resolve(storedPrefsCache);
    }
    if (!storedPrefsPromise) {
        storedPrefsPromise = Promise.all([
            getAppMetadata(VISIBLE_CATEGORY_IDS_KEY),
            getAppMetadata(KNOWN_CATEGORY_IDS_KEY),
            getAppMetadata(VISIBLE_CATEGORY_UNCHECKED_ALL_KEY),
        ])
            .then(([visibleRaw, knownRaw, uncheckedAllRaw]) => {
                storedPrefsCache = {
                    visibleRaw,
                    knownRaw,
                    uncheckedAll: uncheckedAllRaw === "true",
                };
                return storedPrefsCache;
            })
            .catch(() => {
                storedPrefsCache = {
                    visibleRaw: null,
                    knownRaw: null,
                    uncheckedAll: false,
                };
                return storedPrefsCache;
            });
    }
    return storedPrefsPromise;
}

function updateStoredPrefsCache(ids: Set<number>, allIds: number[], uncheckedAll: boolean) {
    storedPrefsCache = {
        visibleRaw: JSON.stringify([...ids]),
        knownRaw: JSON.stringify(allIds),
        uncheckedAll,
    };
}

function resolveVisibleFromStorage(allIds: number[], prefs: StoredPrefs): Set<number> {
    if (!prefs.visibleRaw) {
        return new Set(allIds);
    }

    const savedVisible = new Set<number>(JSON.parse(prefs.visibleRaw) as number[]);

    if (savedVisible.size === 0 && allIds.length > 0 && !prefs.uncheckedAll) {
        return new Set(allIds);
    }

    const savedKnown = prefs.knownRaw ? new Set<number>(JSON.parse(prefs.knownRaw) as number[]) : null;
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
    return merged;
}

export function useVisibleCategoryFilter(categories: Category[]) {
    const [visibleCategoryIds, setVisibleCategoryIds] = useState<Set<number>>(new Set());
    const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
    const categoryFilterRef = useRef<HTMLDivElement | null>(null);
    const categoryFilterPanelRef = useRef<HTMLDivElement | null>(null);
    const hasUserModified = useRef(false);
    const hasLoadedFromStorage = useRef(storedPrefsCache !== null);

    const categoryIdsKey = useMemo(() => categories.map((c) => c.id).join(","), [categories]);

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

    const persistVisibleCategories = useCallback(
        (ids: Set<number>, uncheckedAll: boolean) => {
            const allIds = categories.map((c) => c.id);
            updateStoredPrefsCache(ids, allIds, uncheckedAll);
            setAppMetadata(VISIBLE_CATEGORY_IDS_KEY, JSON.stringify([...ids])).catch(() => {});
            setAppMetadata(KNOWN_CATEGORY_IDS_KEY, JSON.stringify(allIds)).catch(() => {});
            setAppMetadata(VISIBLE_CATEGORY_UNCHECKED_ALL_KEY, uncheckedAll ? "true" : "false").catch(() => {});
        },
        [categories]
    );

    useLayoutEffect(() => {
        if (categories.length === 0 || hasUserModified.current) {
            return;
        }

        const allIds = categories.map((c) => c.id);

        if (storedPrefsCache) {
            setVisibleCategoryIds(resolveVisibleFromStorage(allIds, storedPrefsCache));
            hasLoadedFromStorage.current = true;
            return;
        }

        setVisibleCategoryIds(new Set(allIds));
    }, [categoryIdsKey, categories]);

    useEffect(() => {
        if (categories.length === 0 || hasLoadedFromStorage.current) {
            return;
        }

        const allIds = categories.map((c) => c.id);

        loadStoredPrefs().then((prefs) => {
            hasLoadedFromStorage.current = true;
            if (hasUserModified.current) {
                return;
            }

            const resolved = resolveVisibleFromStorage(allIds, prefs);
            setVisibleCategoryIds(resolved);

            if (!prefs.visibleRaw) {
                persistVisibleCategories(resolved, false);
            } else {
                setAppMetadata(KNOWN_CATEGORY_IDS_KEY, JSON.stringify(allIds)).catch(() => {});
            }
        });
    }, [categoryIdsKey, categories, persistVisibleCategories]);

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

    const toggleVisibleCategory = (catId: number) => {
        hasUserModified.current = true;
        const next = new Set(visibleCategoryIds);
        if (next.has(catId)) next.delete(catId);
        else next.add(catId);
        setVisibleCategoryIds(next);
        persistVisibleCategories(next, false);
    };

    const checkAllCategories = () => {
        hasUserModified.current = true;
        const allVisible = new Set(categories.map((c) => c.id));
        setVisibleCategoryIds(allVisible);
        persistVisibleCategories(allVisible, false);
    };

    const uncheckAllCategories = () => {
        hasUserModified.current = true;
        const noneVisible = new Set<number>();
        setVisibleCategoryIds(noneVisible);
        persistVisibleCategories(noneVisible, true);
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
