import { adjustInstantToCalendarDayBoundary, getWeekRange } from "../../utils.ts";

export const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}).toLowerCase();

export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

export function formatLocalDateYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function getWeekStart(d: Date, calendarStartHour: number): Date {
    const { week_start } = getWeekRange(d, calendarStartHour);
    return new Date(week_start * 1000);
}

export function isCurrentWeek(d: Date, calendarStartHour: number): boolean {
    const nowForWeek = adjustInstantToCalendarDayBoundary(new Date(), calendarStartHour);
    const currentWeekStart = getWeekStart(nowForWeek, calendarStartHour);
    const selectedWeekStart = getWeekStart(d, calendarStartHour);
    return currentWeekStart.getTime() === selectedWeekStart.getTime();
}

export function getCategoryColor(categoryName: string, categoryColor?: string | null): string {
    if (categoryColor) {
        return categoryColor;
    }
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
        hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash) % 20);
    const lightness = 45 + (Math.abs(hash) % 15);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}


export function formatPercentage(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
