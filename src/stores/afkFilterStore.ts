import {create} from "zustand";
import {persist} from "zustand/middleware";
export const useAfkFilter = create<{excludeAfk: boolean; setExcludeAfk: (value: boolean) => void}>()(persist(
    set => ({excludeAfk: false, setExcludeAfk: excludeAfk => set({excludeAfk})}),
    {name: "time-tracker:afk-filter"},
));
export const AFK_FILTER_COMMANDS = new Set([
    "get_week", "get_week_for_app_filter", "get_week_statistics", "get_day_statistics", "get_total_statistics",
    "get_trend_statistics", "get_statistics_bounds", "get_logs_by_category", "get_logs_for_time_block", "get_logs_for_app_in_time_range",
]);
