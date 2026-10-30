import {useQuery} from "@tanstack/react-query";
import {useMemo} from "react";
import {ALL_CATEGORIES_QUERY_KEY, get_all_categories, get_categories, type Category} from "../api/Category.ts";

const NO_CATEGORIES: Category[] = [];

/**
 * Top-level categories and subcategories together. Filters update ["categories"] in place,
 * so top-level rows come from there to keep their visibility flags current.
 */
export function useAllCategories(): Category[] {
    const {data: topLevel = NO_CATEGORIES} = useQuery({queryKey: ["categories"], queryFn: get_categories});
    const {data: all = NO_CATEGORIES} = useQuery({queryKey: ALL_CATEGORIES_QUERY_KEY, queryFn: get_all_categories});
    return useMemo(() => [...topLevel, ...all.filter((category) => category.parent_id != null)], [topLevel, all]);
}
