import { unwrapResult } from "../../utils.ts";
import { get_week, TimeBlock } from "../../api/week.ts";
import CalendarSkeleton from "./CalanderSkeletion.tsx";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useMemo, useState } from "react";
import { getCategoryColor, getWeekStart } from "./utils.ts";
import { CalendarEvent, DateClickInfo, EventLogs } from "./types.ts";
import { Category } from "../../api/Category.ts";
import { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import interactionPlugin from '@fullcalendar/interaction';
import { useDateStore } from "../../stores/dateStore.ts";
import { get_all_google_calendar_events, GoogleCalendarEvent, GoogleCalendar, update_google_calendar, delete_google_calendar, UpdateGoogleCalendar } from "../../api/GoogleCalendar.ts";
import { getWeekRange } from "../../utils.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../Componants/Toast.tsx";

interface RenderCalendarContentProps {
    ref: any;
    date: Date;
    visibleCategories: Set<string>;
    categoryColorMap: Map<string, string>;
    categories: Category[];
    toggleCategory: (categoryName: string) => void;
    checkAllCategories: () => void;
    uncheckAllCategories: () => void;
    handleEventClick: (clickInfo: EventClickArg) => void;
    onDatesSet: (dates: DatesSetArg) => void;
    googleCalendarMap: Map<number, GoogleCalendar>;
    googleCalendars: GoogleCalendar[];
    visibleCalendars: Set<number>;
    toggleCalendar: (calendarId: number) => void;
}

export default function RenderCalendarContent({
    ref,
    date,
    visibleCategories,
    categoryColorMap,
    categories,
    toggleCategory,
    checkAllCategories,
    uncheckAllCategories,
    handleEventClick,
    onDatesSet,
    googleCalendarMap,
    googleCalendars,
    visibleCalendars,
    toggleCalendar,
}: RenderCalendarContentProps) {
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const [editingCalendar, setEditingCalendar] = useState<GoogleCalendar | null>(null);
    const [newCalendarName, setNewCalendarName] = useState("");
    const [newCalendarColor, setNewCalendarColor] = useState("#4285f4");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [calendarToDelete, setCalendarToDelete] = useState<number | null>(null);

    const updateCalendarMutation = useMutation({
        mutationFn: async (update: UpdateGoogleCalendar) => {
            return unwrapResult(await update_google_calendar(update));
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["googleCalendars"] });
            // Invalidate all googleCalendarEvents queries
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            // Force refetch of current week's events
            await refetchGoogleEvents();
            queryClient.invalidateQueries({ queryKey: ["week"] });
            setEditingCalendar(null);
            setNewCalendarName("");
            setNewCalendarColor("#4285f4");
            showToast("Calendar updated successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to update calendar:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to update calendar", "error", 5000, fullError);
        },
    });

    const deleteCalendarMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_google_calendar(id));
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["googleCalendars"] });
            // Invalidate all googleCalendarEvents queries
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            // Force refetch of current week's events
            await refetchGoogleEvents();
            queryClient.invalidateQueries({ queryKey: ["week"] });
            setShowDeleteConfirm(false);
            setCalendarToDelete(null);
            showToast("Calendar deleted successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to delete calendar:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to delete calendar", "error", 5000, fullError);
        },
    });


    const handleUpdate = () => {
        if (!editingCalendar) return;

        const update: UpdateGoogleCalendar = {
            id: editingCalendar.id,
        };

        if (editingCalendar.name !== newCalendarName) {
            update.name = newCalendarName;
        }

        if (editingCalendar.color !== newCalendarColor) {
            update.color = newCalendarColor;
        }

        updateCalendarMutation.mutate(update);
    };

    const handleEdit = (calendar: GoogleCalendar) => {
        setEditingCalendar(calendar);
        setNewCalendarName(calendar.name);
        setNewCalendarColor(calendar.color);
    };

    const handleDelete = (id: number) => {
        setCalendarToDelete(id);
        setShowDeleteConfirm(true);
    };

    // Use week start for consistent querying
    const weekStart = getWeekStart(date);
    const { data, isLoading, error } = useQuery({
        queryKey: ["week", weekStart.toISOString()],
        queryFn: async () => unwrapResult(await get_week(weekStart)),
        enabled: !!weekStart && !isNaN(weekStart.getTime()),
        refetchOnWindowFocus: true, // Refetch when window gains focus
    });

    // Fetch Google Calendar events
    const weekRange = useMemo(() => getWeekRange(date), [date]);
    const calendarIds = useMemo(() => googleCalendars.map(cal => cal.id).sort().join(','), [googleCalendars]);
    const { data: googleCalendarEvents, refetch: refetchGoogleEvents, error: googleEventsError, isLoading: isLoadingGoogleEvents } = useQuery({
        queryKey: ["googleCalendarEvents", weekRange.week_start, weekRange.week_end, calendarIds],
        queryFn: async () => {
            const result = await get_all_google_calendar_events(weekRange.week_start, weekRange.week_end);
            return unwrapResult(result);
        },
        enabled: !!weekStart && !isNaN(weekStart.getTime()) && googleCalendars.length > 0,
        refetchOnWindowFocus: true, // Refetch when window gains focus
    });

    // Log errors for debugging
    useEffect(() => {
        if (googleEventsError) {
            console.error("Error fetching Google Calendar events:", googleEventsError);
        }
    }, [googleEventsError]);


    // Move all hooks to the top, before any conditional returns
    const events = useMemo(() => {
        const timeBlockEvents = (data || [])
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
                    id: `timeblock-${block.id}`,
                    title: block.category,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    backgroundColor: color,
                    borderColor: color,
                    textColor: "#ffffff",
                    extendedProps: {
                        apps: block.apps,
                        type: "timeblock",
                    },
                };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null);

        // Add Google Calendar events (only for visible calendars)
        const googleEvents = (googleCalendarEvents || [])
            .filter((event: GoogleCalendarEvent) => visibleCalendars.has(event.calendar_id))
            .map((event: GoogleCalendarEvent) => {
                const start = new Date(event.start * 1000);
                const end = new Date(event.end * 1000);

                if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                    return null;
                }

                // Filter out all-day events (12:00 a.m. to 12:00 a.m.)
                // Check if both start and end are at midnight
                const isMidnightStart = start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0;
                const isMidnightEnd = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;

                if (isMidnightStart && isMidnightEnd) {
                    // Check if same day or exactly 24 hours apart (all-day event)
                    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
                    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
                    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

                    // Same day (duration 0) or exactly 1 day difference (duration 1) = all-day event
                    if (daysDiff === 0 || daysDiff === 1) {
                        return null;
                    }
                }

                // Get calendar color
                const calendar = googleCalendarMap.get(event.calendar_id);
                const color = calendar?.color || "#4285f4"; // Default to Google blue if calendar not found

                return {
                    id: `google-${event.event_id}-${event.calendar_id}`,
                    title: event.title,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    backgroundColor: color,
                    borderColor: color,
                    textColor: "#ffffff",
                    extendedProps: {
                        type: "google_calendar",
                        eventId: event.event_id,
                        calendarId: event.calendar_id,
                        description: event.description,
                        location: event.location,
                    },
                };
            }).filter((e): e is NonNullable<typeof e> => e !== null);

        const allEvents = [...timeBlockEvents, ...googleEvents];

        return allEvents;
    }, [data, categoryColorMap, visibleCategories, googleCalendarEvents, visibleCalendars, googleCalendarMap]);


    // Now handle conditional returns after all hooks
    if (isLoading || isLoadingGoogleEvents) {
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

    // Check if we have any events to display (logs or Google Calendar events)
    const hasTimeBlocks = data && data.length > 0;
    // Check if there are any visible Google Calendar events (filtered by visibleCalendars)
    const hasGoogleEvents = googleCalendarEvents && googleCalendarEvents.length > 0 &&
        googleCalendarEvents.some((event: GoogleCalendarEvent) => visibleCalendars.has(event.calendar_id));
    const hasAnyEvents = hasTimeBlocks || hasGoogleEvents;

    // Only show "No data" message if we have neither logs nor Google Calendar events
    if (!hasAnyEvents) {
        return (
            <div className="flex items-center justify-center h-full w-full">
                <div className="text-center">
                    <div className="text-gray-400 text-4xl mb-4 font-semibold">
                        No data for this week
                    </div>
                    <div className="text-gray-600 text-xl">
                        Start tracking to see your activity here
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 overflow-hidden h-full min-h-0">
            <div className="w-64 border-r border-gray-700 bg-black p-4 overflow-y-auto flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                        Filter Categories
                    </h3>
                </div>
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={checkAllCategories}
                        className="flex-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                    >
                        Check All
                    </button>
                    <button
                        onClick={uncheckAllCategories}
                        className="flex-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-white transition-colors"
                    >
                        Uncheck All
                    </button>
                </div>
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
                                <span className="text-sm text-gray-200 flex-1">
                                    {categoryName}
                                </span>
                            </label>
                        );
                    })}
                </div>

                {/* Divider */}
                <div className="border-t border-gray-700 my-4"></div>

                {/* Google Calendars Section */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-white">
                            Google Calendars
                        </h3>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                        Manage calendars in Google Calendar settings
                    </p>

                    {/* Edit Form (only when editing) */}
                    {editingCalendar && (
                        <div className="mb-4 p-3 bg-gray-900 rounded-lg space-y-2">
                            <input
                                type="text"
                                value={newCalendarName}
                                onChange={(e) => setNewCalendarName(e.target.value)}
                                className="w-full px-2 py-1 bg-gray-800 text-white rounded text-sm"
                                placeholder="Calendar Name"
                            />
                            <div className="flex gap-2 items-center">
                                <input
                                    type="color"
                                    value={newCalendarColor}
                                    onChange={(e) => setNewCalendarColor(e.target.value)}
                                    className="w-10 h-8 rounded cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={newCalendarColor}
                                    onChange={(e) => setNewCalendarColor(e.target.value)}
                                    className="flex-1 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleUpdate}
                                    disabled={updateCalendarMutation.isPending}
                                    className="flex-1 px-2 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingCalendar(null);
                                        setNewCalendarName("");
                                        setNewCalendarColor("#4285f4");
                                    }}
                                    className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-white"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Calendar List */}
                    <div className="space-y-2">
                        {googleCalendars.map((calendar) => {
                            const isVisible = visibleCalendars.has(calendar.id);
                            const isEditing = editingCalendar?.id === calendar.id;

                            return (
                                <div
                                    key={calendar.id}
                                    className={`flex items-center gap-2 p-2 rounded hover:bg-gray-900 ${isEditing ? "bg-gray-800" : ""}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isVisible}
                                        onChange={() => toggleCalendar(calendar.id)}
                                        className="w-4 h-4 rounded cursor-pointer"
                                    />
                                    <div
                                        className="w-4 h-4 rounded border border-gray-600"
                                        style={{ backgroundColor: calendar.color }}
                                    />
                                    <span className="text-sm text-gray-200 flex-1 truncate">
                                        {calendar.name}
                                    </span>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleEdit(calendar)}
                                            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white"
                                            title="Edit"
                                        >
                                            ✎
                                        </button>
                                        <button
                                            onClick={() => handleDelete(calendar.id)}
                                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded text-white"
                                            title="Delete"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {googleCalendars.length === 0 && (
                            <p className="text-sm text-gray-500">No calendars added</p>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex-1 h-full overflow-hidden min-h-0">
                <FullCalendar
                    height="100%"
                    ref={ref}
                    plugins={[timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    initialDate={weekStart.toISOString().split('T')[0]}
                    events={events}
                    eventClick={handleEventClick}
                    allDaySlot={false}
                    nowIndicator={true}
                    headerToolbar={false}
                    firstDay={1}
                    datesSet={onDatesSet}
                />
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md">
                        <h3 className="text-xl font-semibold mb-4 text-white">Delete Calendar?</h3>
                        <p className="text-gray-400 mb-4">
                            This will delete the calendar and all its events. This action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    setCalendarToDelete(null);
                                }}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (calendarToDelete !== null) {
                                        deleteCalendarMutation.mutate(calendarToDelete);
                                    }
                                }}
                                disabled={deleteCalendarMutation.isPending}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
                            >
                                {deleteCalendarMutation.isPending ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}