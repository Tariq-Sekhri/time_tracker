import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { get_week, TimeBlock } from "../api/week.ts";
import { get_categories } from "../api/Category.ts";
import { unwrapResult } from "../utils.ts";
import { useState, useMemo, useEffect, useRef } from "react";
import { EventClickArg, DatesSetArg } from "@fullcalendar/core";

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

// Fallback function to assign colors to categories if no color is set
function getCategoryColor(categoryName: string, categoryColor?: string | null): string {
    if (categoryColor) {
        return categoryColor;
    }
    // Simple hash function for consistent color generation as fallback
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
        hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Generate HSL color with good saturation and lightness
    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash) % 20); // 60-80%
    const lightness = 45 + (Math.abs(hash) % 15); // 45-60%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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

    // Initialize visible categories with all categories from database
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

                // Get color from database, fallback to hash if not set
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

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error.message}</div>;
    }

    if (events.length > 0) {
        const eventDays = new Set(events.map(e => new Date(e.start).toDateString()));
        console.log('Unique days with events:', Array.from(eventDays));
        if (eventDays.size === 1) {
            console.warn('⚠️ All events are on the same day! This might indicate a date conversion issue.');
        }
    }

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

    const handleDatesSet = (arg: DatesSetArg) => {
        const newDate = new Date(arg.start);
        if (!isNaN(newDate.getTime())) {
            setDate(newDate);
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

    return (
        <div className="flex h-full">
            {/* Left Sidebar - Category Filter */}
            <div className="w-64 border-r border-gray-700 bg-black p-4 overflow-y-auto">
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

            {/* Calendar Area */}
            <div className={`flex-1 transition-all duration-300 ${selectedEvent ? 'w-2/3' : 'w-full'}`}>
                <div className="p-4">
                    <FullCalendar
                        plugins={[timeGridPlugin]}
                        initialView="timeGridWeek"
                        initialDate={date}
                        headerToolbar={{
                            right: "prev,next today",
                            center: "title",
                        }}
                        datesSet={handleDatesSet}
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
                </div>
            </div>
            
            {selectedEvent && (
                <div className="w-1/3 border-l border-gray-700 bg-black shadow-lg p-6 overflow-y-auto">
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
    );
}