import { invokeWithResult } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

export type CategoryStat = {
    category: string;
    total_duration: number;
    percentage: number;
    percentage_change: number | null;
    color: string | null;
};

export type AppStat = {
    app: string;
    total_duration: number;
    percentage_change: number | null;
};

export type HourlyStat = {
    hour: number;
    total_duration: number;
};

export type DayCategoryStat = {
    day: number;
    category: string;
    total_duration: number;
};

export type WeekStatistics = {
    total_time: number;
    total_time_change: number | null;
    categories: CategoryStat[];
    top_apps: AppStat[];
    all_apps: AppStat[]; // All apps for apps list screen
    hourly_distribution: HourlyStat[];
    day_category_breakdown: DayCategoryStat[];
    first_active_day: number | null;
    number_of_active_days: number;
    total_number_of_days: number;
    all_time_today: number;
    total_time_all_time: number;
    average_time_active_days: number;
    most_active_day: [number, number] | null; // [timestamp, duration]
    most_inactive_day: [number, number] | null; // [timestamp, duration]
};

export type DayStatistics = {
    total_time: number;
    categories: CategoryStat[];
    top_apps: AppStat[];
    hourly_distribution: HourlyStat[];
};

export async function get_week_statistics(weekStart: number, weekEnd: number): Promise<Result<WeekStatistics, AppError>> {
    return invokeWithResult<WeekStatistics>("get_week_statistics", {
        weekStart,
        weekEnd,
    });
}

export async function get_day_statistics(dayStart: number, dayEnd: number): Promise<Result<DayStatistics, AppError>> {
    return invokeWithResult<DayStatistics>("get_day_statistics", {
        dayStart,
        dayEnd,
    });
}
