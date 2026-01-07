import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { get_week, TimeBlock } from "../api/week.ts";
import { get_categories } from "../api/Category.ts";
import { unwrapResult } from "../utils.ts";
import { useState, useMemo, useEffect, useRef } from "react";
import { EventClickArg } from "@fullcalendar/core";

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

function getCategoryColor(categoryName: string, categoryColor?: string | null): string {
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

function getWeekStart(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function isCurrentWeek(d: Date): boolean {
    const now = new Date();
    const currentWeekStart = getWeekStart(now);
    const selectedWeekStart = getWeekStart(d);
    return currentWeekStart.getTime() === selectedWeekStart.getTime();
}

function CalendarSkeleton() {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="animate-pulse">
            <div className="flex border-b border-gray-700 mb-2">
                <div className="w-16"></div>
                {days.map((day) => (
                    <div key={day} className="flex-1 text-center py-3">
                        <div className="h-4 bg-gray-700 rounded w-8 mx-auto mb-1"></div>
                        <div className="h-6 bg-gray-700 rounded w-6 mx-auto"></div>
                    </div>
                ))}
            </div>
            <div className="relative">
                {hours.slice(0, 12).map((hour) => (
                    <div key={hour} className="flex border-b border-gray-800 h-12">
                        <div className="w-16 text-right pr-2 text-xs text-gray-600">
                            {hour}:00
                        </div>
                        {days.map((day) => (
                            <div key={`${day}-${hour}`} className="flex-1 border-l border-gray-800">
                                {Math.random() > 0.85 && (
                                    <div
                                        className="bg-gray-700 rounded mx-1 mt-1"
                                        style={{ height: `${20 + Math.random() * 30}px` }}
                                    ></div>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Calendar() {
    const [date, setDate] = useState<Date>(() => new Date());
    const [selectedEvent, setSelectedEvent] = useState<{
        title: string;
        start: Date;
        end: Date;
        apps: { app: string; totalDuration: number }[];
    } | null>(null);
    const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set());
    const hasInitialized = useRef(false);

    const { data, isLoading, error } = useQuery({
        queryKey: ["week", date.toISOString()],
        queryFn: async () => unwrapResult(await get_week(date)),
        enabled: !!date && !isNaN(date.getTime()),
    });

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: async () => unwrapResult(await get_categories()),
    });

    const categoryColorMap = useMemo(() => {
        const map = new Map<string, string>();
        categories.forEach(cat => {
            if (cat.color) {
                map.set(cat.name, cat.color);
            }
        });
        return map;
    }, [categories]);

    useEffect(() => {
        if (categories.length > 0 && !hasInitialized.current) {
            const allCategoryNames = categories.map(cat => cat.name);
            setVisibleCategories(new Set(allCategoryNames));
            hasInitialized.current = true;
        }
    }, [categories]);

    const events = useMemo(() => {
        if (!data) return [];

        return (data || [])
            .filter((block: TimeBlock) => visibleCategories.has(block.category))
            .map((block: TimeBlock) => {
                const startMs = block.startTime * 1000;
                const endMs = block.endTime * 1000;
                const start = new Date(startMs);
                const end = new Date(endMs);

                if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                    return null;
                }

                const dbColor = categoryColorMap.get(block.category);
                const color = getCategoryColor(block.category, dbColor);

                return {
                    id: block.id.toString(),
                    title: block.category,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    backgroundColor: color,
                    borderColor: color,
                    textColor: '#ffffff',
                    extendedProps: {
                        apps: block.apps,
                    },
                };
            }).filter((e): e is NonNullable<typeof e> => e !== null);
    }, [data, categoryColorMap, visibleCategories]);

    const handleEventClick = (clickInfo: EventClickArg) => {
        if (clickInfo.event.start && clickInfo.event.end) {
            setSelectedEvent({
                title: clickInfo.event.title,
                start: clickInfo.event.start,
                end: clickInfo.event.end,
                apps: (clickInfo.event.extendedProps?.apps || []) as { app: string; totalDuration: number }[],
            });
        }
    };

    const handleCalendarClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const isEventClick = target.closest('.fc-event') !== null;
        if (!isEventClick) {
            setSelectedEvent(null);
        }
    };

    const toggleCategory = (categoryName: string) => {
        setVisibleCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryName)) {
                newSet.delete(categoryName);
            } else {
                newSet.add(categoryName);
            }
            return newSet;
        });
    };

    const goToPrevWeek = () => {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() - 7);
        setDate(newDate);
        setSelectedEvent(null);
    };

    const goToNextWeek = () => {
        if (!isCurrentWeek(date)) {
            const newDate = new Date(date);
            newDate.setDate(newDate.getDate() + 7);
            setDate(newDate);
            setSelectedEvent(null);
        }
    };

    const goToToday = () => {
        setDate(new Date());
        setSelectedEvent(null);
    };

    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const headerTitle = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const renderCalendarContent = () => {
        if (isLoading) {
            return <CalendarSkeleton />;
        }

        if (error) {
            return (
                <div className="flex items-center justify-center h-96">
                    <div className="text-center">
                        <div className="text-red-400 text-xl mb-2">Error loading data</div>
                        <div className="text-gray-500">{error.message}</div>
                    </div>
                </div>
            );
        }

        if (!data || data.length === 0) {
            return (
                <div className="relative">
                    <FullCalendar
                        key={date.toISOString()}
                        plugins={[timeGridPlugin]}
                        initialView="timeGridWeek"
                        initialDate={date}
                        headerToolbar={false}
                        editable={false}
                        selectable={false}
                        dayMaxEvents={true}
                        events={[]}
                        height="auto"
                        allDaySlot={false}
                        eventDisplay="block"
                        nowIndicator={true}
                        timeZone="local"
                        firstDay={1}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
                        <div className="text-center">
                            <div className="text-gray-400 text-xl mb-2">No data for this week</div>
                            <div className="text-gray-600 text-sm">Start tracking to see your activity here</div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <FullCalendar
                key={date.toISOString()}
                plugins={[timeGridPlugin]}
                initialView="timeGridWeek"
                initialDate={date}
                headerToolbar={false}
                editable={false}
                selectable={false}
                dayMaxEvents={true}
                events={events}
                height="auto"
                allDaySlot={false}
                eventDisplay="block"
                nowIndicator={true}
                timeZone="local"
                firstDay={1}
                eventClick={handleEventClick}
            />
        );
    };

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-shrink-0 p-4 border-b border-gray-700 bg-black">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-white">{headerTitle}</h2>
                    <div className="flex gap-2">
                        <button
                            className="px-3 py-1 bg-gray-800 text-white rounded hover:bg-gray-700"
                            onClick={goToPrevWeek}
                        >
                            ‹
                        </button>
                        <button
                            className={`px-3 py-1 rounded ${isCurrentWeek(date)
                                ? 'bg-gray-900 text-gray-600 cursor-not-allowed'
                                : 'bg-gray-800 text-white hover:bg-gray-700'
                                }`}
                            onClick={goToNextWeek}
                            disabled={isCurrentWeek(date)}
                        >
                            ›
                        </button>
                        <button
                            className="px-3 py-1 bg-gray-800 text-white rounded hover:bg-gray-700"
                            onClick={goToToday}
                        >
                            today
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div className="w-64 border-r border-gray-700 bg-black p-4 overflow-y-auto flex-shrink-0">
                    <h3 className="text-lg font-semibold text-white mb-4">Filter Categories</h3>
                    <div className="space-y-2">
                        {categories.map((category) => {
                            const categoryName = category.name;
                            const isVisible = visibleCategories.has(categoryName);
                            const dbColor = categoryColorMap.get(categoryName);
                            const color = getCategoryColor(categoryName, dbColor);

                            return (
                                <label
                                    key={category.id}
                                    className="flex items-center gap-3 p-2 rounded hover:bg-gray-900 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isVisible}
                                        onChange={() => toggleCategory(categoryName)}
                                        className="w-4 h-4 rounded cursor-pointer"
                                    />
                                    <div
                                        className="w-4 h-4 rounded border border-gray-600"
                                        style={{ backgroundColor: color }}
                                    />
                                    <span className="text-sm text-gray-200 flex-1">{categoryName}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto p-4" onClick={handleCalendarClick}>
                        {renderCalendarContent()}
                    </div>
                </div>

                {selectedEvent && (
                    <div className="w-120 border-l border-gray-700 bg-black shadow-lg p-6 overflow-y-auto flex-shrink-0">
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-2xl font-bold text-white">{selectedEvent.title}</h2>
                            <button
                                onClick={() => setSelectedEvent(null)}
                                className="text-gray-400 hover:text-white text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="mb-4 text-sm text-gray-400">
                            {selectedEvent.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                            {selectedEvent.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-lg mb-2 text-white">Apps</h3>
                            {selectedEvent.apps.length > 0 ? (
                                selectedEvent.apps.map((app, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-700">
                                        <span className="text-sm font-medium text-gray-200">{app.app}</span>
                                        <span className="text-sm text-gray-400">{formatDuration(app.totalDuration)}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">No apps recorded</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
