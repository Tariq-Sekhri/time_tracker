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

export function getWeekStart(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

export function isCurrentWeek(d: Date): boolean {
    const now = new Date();
    const currentWeekStart = getWeekStart(now);
    const selectedWeekStart = getWeekStart(d);
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
