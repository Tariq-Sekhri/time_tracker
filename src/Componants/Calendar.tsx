import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { get_week, TimeBlock } from "../api/week.ts";
import { get_categories } from "../api/Category.ts";
import { delete_logs_for_time_block, count_logs_for_time_block, get_logs_for_time_block } from "../api/Log.ts";
import { unwrapResult } from "../utils.ts";
import { useState, useMemo, useEffect, useRef } from "react";
import { EventClickArg } from "@fullcalendar/core";
import StatisticsSidebar from "./StatisticsSidebar.tsx";
import DetailedStatistics from "./DetailedStatistics.tsx";
import AppsList from "./AppsList.tsx";

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
    const queryClient = useQueryClient();
    const [date, setDate] = useState<Date>(() => new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<{
        title: string;
        start: Date;
        end: Date;
        apps: { app: string; totalDuration: number }[];
    } | null>(null);
    const [selectedEventLogs, setSelectedEventLogs] = useState<{
        app: string;
        timestamp: Date;
        duration: number;
    }[]>([]);
    const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set());
    const [view, setView] = useState<"calendar" | "detailed" | "apps">("calendar");
    const hasInitialized = useRef(false);

    // Delete confirmation state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteLogCount, setDeleteLogCount] = useState(0);
    const [isCountingLogs, setIsCountingLogs] = useState(false);

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

    // Add click handlers to date headers
    useEffect(() => {
        const handleHeaderClick = (e: Event) => {
            const target = e.target as HTMLElement;
            const headerCell = target.closest('.fc-col-header-cell');
            if (headerCell) {
                const dateStr = headerCell.getAttribute('data-date');
                if (dateStr) {
                    const clickedDate = new Date(dateStr + "T00:00:00");
                    setSelectedDate(clickedDate);
                    setSelectedEvent(null);
                    setSelectedEventLogs([]);
                }
            }
        };

        // Add click listeners to header cells
        const headerCells = document.querySelectorAll('.fc-col-header-cell');
        headerCells.forEach(cell => {
            (cell as HTMLElement).style.cursor = 'pointer';
            cell.addEventListener('click', handleHeaderClick);
        });

        return () => {
            headerCells.forEach(cell => {
                cell.removeEventListener('click', handleHeaderClick);
            });
        };
    }, [data, date]); // Re-run when calendar data changes

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

    const handleEventClick = async (clickInfo: EventClickArg) => {
        if (clickInfo.event.start && clickInfo.event.end) {
            const event = {
                title: clickInfo.event.title,
                start: clickInfo.event.start,
                end: clickInfo.event.end,
                apps: (clickInfo.event.extendedProps?.apps || []) as { app: string; totalDuration: number }[],
            };
            setSelectedEvent(event);
            setSelectedDate(null); // Clear date selection when event is selected

            // Fetch and sort logs by duration
            const startTime = Math.floor(event.start.getTime() / 1000);
            const endTime = Math.floor(event.end.getTime() / 1000);
            const appNames = event.apps.map(a => a.app);

            const result = await get_logs_for_time_block({
                app_names: appNames,
                start_time: startTime,
                end_time: endTime,
            });

            if (result.success) {
                const logs = result.data.map(log => ({
                    app: log.app,
                    timestamp: new Date(Number(log.timestamp) * 1000),
                    duration: log.duration,
                }));
                // Sort by duration (longest first) - backend already sorts, but ensure it here too
                logs.sort((a, b) => b.duration - a.duration);
                setSelectedEventLogs(logs);
            } else {
                setSelectedEventLogs([]);
            }
        }
    };

    const handleCalendarClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const isEventClick = target.closest('.fc-event') !== null;
        const isHeaderClick = target.closest('.fc-col-header-cell') !== null;
        if (!isEventClick && !isHeaderClick) {
            setSelectedEvent(null);
            setSelectedEventLogs([]);
            // Don't clear selectedDate on calendar click - only clear on event click
        }
    };

    const deleteTimeBlockMutation = useMutation({
        mutationFn: async (params: { appNames: string[]; startTime: number; endTime: number }) => {
            return unwrapResult(await delete_logs_for_time_block({
                app_names: params.appNames,
                start_time: params.startTime,
                end_time: params.endTime,
            }));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["week"] });
            setSelectedEvent(null);
            setSelectedEventLogs([]);
            setShowDeleteConfirm(false);
        },
    });

    const handleDeleteClick = async () => {
        if (!selectedEvent) return;

        setIsCountingLogs(true);
        const startTime = Math.floor(selectedEvent.start.getTime() / 1000);
        const endTime = Math.floor(selectedEvent.end.getTime() / 1000);
        const appNames = selectedEvent.apps.map(a => a.app);

        const result = await count_logs_for_time_block({
            app_names: appNames,
            start_time: startTime,
            end_time: endTime,
        });

        if (result.success) {
            setDeleteLogCount(result.data);
            setShowDeleteConfirm(true);
        }
        setIsCountingLogs(false);
    };

    const handleConfirmDelete = () => {
        if (!selectedEvent) return;

        const startTime = Math.floor(selectedEvent.start.getTime() / 1000);
        const endTime = Math.floor(selectedEvent.end.getTime() / 1000);
        const appNames = selectedEvent.apps.map(a => a.app);

        deleteTimeBlockMutation.mutate({
            appNames,
            startTime,
            endTime,
        });
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
        setSelectedEventLogs([]);
        setSelectedDate(null);
    };

    const goToNextWeek = () => {
        if (!isCurrentWeek(date)) {
            const newDate = new Date(date);
            newDate.setDate(newDate.getDate() + 7);
            setDate(newDate);
            setSelectedEvent(null);
            setSelectedEventLogs([]);
            setSelectedDate(null);
        }
    };

    const goToToday = () => {
        setDate(new Date());
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
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
                <div className="flex items-center justify-center h-full w-full">
                    <div className="text-center">
                        <div className="text-gray-400 text-4xl mb-4 font-semibold">No data for this week</div>
                        <div className="text-gray-600 text-xl">Start tracking to see your activity here</div>
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

            {view === "calendar" && (
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

                    {/* Statistics Sidebar */}
                    <StatisticsSidebar
                        selectedDate={selectedDate}
                        weekDate={date}
                        onMoreInfo={() => setView("detailed")}
                        onAppsList={() => setView("apps")}
                    />
                </div>
            )}

            {view === "detailed" && (
                <DetailedStatistics
                    weekDate={date}
                    onBack={() => setView("calendar")}
                />
            )}

            {view === "apps" && (
                <AppsList
                    weekDate={date}
                    onBack={() => setView("calendar")}
                />
            )}

            {/* Event Details Modal (shown when event is selected) */}
            {selectedEvent && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-2xl font-bold text-white">{selectedEvent.title}</h2>
                            <button
                                onClick={() => {
                                    setSelectedEvent(null);
                                    setSelectedEventLogs([]);
                                }}
                                className="text-gray-400 hover:text-white text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="mb-4 text-sm text-gray-400">
                            {selectedEvent.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                            {selectedEvent.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        <div className="space-y-2 mb-4">
                            <h3 className="font-semibold text-lg mb-2 text-white">Logs (sorted by duration)</h3>
                            {selectedEventLogs.length > 0 ? (
                                selectedEventLogs.map((log, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-700">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-200">{log.app}</span>
                                            <span className="text-xs text-gray-500">{log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <span className="text-sm text-gray-400">{formatDuration(log.duration)}</span>
                                    </div>
                                ))
                            ) : selectedEvent.apps.length > 0 ? (
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

                        {/* Delete Button */}
                        <div className="pt-4 border-t border-gray-700">
                            <button
                                onClick={handleDeleteClick}
                                disabled={isCountingLogs || deleteTimeBlockMutation.isPending}
                                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
                            >
                                {isCountingLogs ? "Checking..." : "Delete Time Block"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && selectedEvent && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white">Delete Time Block?</h3>
                        <p className="text-gray-300 mb-2">
                            Category: <span className="font-semibold">{selectedEvent.title}</span>
                        </p>
                        <p className="text-gray-300 mb-2">
                            Time: {selectedEvent.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {selectedEvent.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-gray-300 mb-4">
                            This will <span className="text-red-400 font-semibold">permanently delete {deleteLogCount} log{deleteLogCount !== 1 ? 's' : ''}</span> associated with this time block.
                        </p>
                        {deleteLogCount > 0 && (
                            <p className="text-yellow-400 text-sm mb-4">
                                ⚠️ This action cannot be undone!
                            </p>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={deleteTimeBlockMutation.isPending}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
                            >
                                {deleteTimeBlockMutation.isPending ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
