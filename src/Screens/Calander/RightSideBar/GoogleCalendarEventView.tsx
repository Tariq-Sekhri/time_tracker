import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
    get_google_calendar_by_id,
    GoogleCalendar,
    update_google_calendar_event,
    delete_google_calendar_event,
} from "../../../api/GoogleCalendar.ts";
import { unwrapResult } from "../../../utils.ts";
import { CalendarEvent } from "../types.ts";
import { useToast } from "../../../Componants/Toast.tsx";

interface GoogleCalendarEventViewProps {
    selectedEvent: CalendarEvent;
    setSelectedEvent: (event: CalendarEvent) => void;
    setRightSideBarView: (view: "Week" | "Day" | "Event" | "CategoryFilter") => void;
}

export default function GoogleCalendarEventView({
    selectedEvent,
    setSelectedEvent,
    setRightSideBarView,
}: GoogleCalendarEventViewProps) {
    const calendarId = selectedEvent?.googleCalendarId;
    const eventId = selectedEvent?.googleCalendarEventId;
    const queryClient = useQueryClient();
    const { showToast } = useToast();

    const [isEditing, setIsEditing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [editedTitle, setEditedTitle] = useState(selectedEvent?.title || "");
    const [editedDescription, setEditedDescription] = useState(selectedEvent?.description || "");
    const [editedStartDateTime, setEditedStartDateTime] = useState("");
    const [editedEndDateTime, setEditedEndDateTime] = useState("");

    // Initialize form fields when selectedEvent changes
    useEffect(() => {
        if (selectedEvent) {
            setEditedTitle(selectedEvent.title || "");
            setEditedDescription(selectedEvent.description || "");

            // Format for datetime-local input (YYYY-MM-DDTHH:mm)
            const startDateTime = new Date(selectedEvent.start);
            const endDateTime = new Date(selectedEvent.end);
            // Convert to local time and format
            const startStr = new Date(startDateTime.getTime() - startDateTime.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 16);
            const endStr = new Date(endDateTime.getTime() - endDateTime.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 16);
            setEditedStartDateTime(startStr);
            setEditedEndDateTime(endStr);
        }
    }, [selectedEvent]);

    const { data: calendar } = useQuery({
        queryKey: ["googleCalendar", calendarId],
        queryFn: async () => {
            if (!calendarId) return null;
            const result = await get_google_calendar_by_id(calendarId);
            return unwrapResult(result);
        },
        enabled: !!calendarId,
    });

    const updateEventMutation = useMutation({
        mutationFn: async (updatedEvent: {
            calendar_id: number;
            event_id: string;
            title: string;
            description?: string;
            start: number;
            end: number;
        }) => {
            return unwrapResult(await update_google_calendar_event(updatedEvent));
        },
        onSuccess: () => {
            // Invalidate queries to refresh the calendar
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            queryClient.invalidateQueries({ queryKey: ["week"] });

            // Update the selected event with new values
            if (selectedEvent && calendarId && eventId) {
                const newStart = new Date(editedStartDateTime);
                const newEnd = new Date(editedEndDateTime);

                setSelectedEvent({
                    ...selectedEvent,
                    title: editedTitle,
                    description: editedDescription || undefined,
                    start: newStart,
                    end: newEnd,
                });
            }

            setIsEditing(false);
            showToast("Event updated successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to update event:", error);
            setIsEditing(false);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to update event", "error", 5000, fullError);
        },
    });

    const deleteEventMutation = useMutation({
        mutationFn: async () => {
            if (!calendarId || !eventId) throw new Error("Missing calendar or event ID");
            return unwrapResult(await delete_google_calendar_event({
                calendar_id: calendarId,
                event_id: eventId,
            }));
        },
        onSuccess: () => {
            // Invalidate queries to refresh the calendar
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            queryClient.invalidateQueries({ queryKey: ["week"] });

            // Close the sidebar
            setSelectedEvent(null);
            setRightSideBarView("Week");
            showToast("Event deleted successfully", "success");
        },
        onError: (error: any) => {
            console.error("Failed to delete event:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to delete event", "error", 5000, fullError);
        },
    });

    const handleSave = () => {
        if (!calendarId || !eventId) return;

        const startDateTime = new Date(editedStartDateTime);
        const endDateTime = new Date(editedEndDateTime);

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            alert("Invalid date or time");
            return;
        }

        if (endDateTime <= startDateTime) {
            alert("End time must be after start time");
            return;
        }

        updateEventMutation.mutate({
            calendar_id: calendarId,
            event_id: eventId,
            title: editedTitle.trim(),
            description: editedDescription.trim() || undefined,
            start: Math.floor(startDateTime.getTime() / 1000),
            end: Math.floor(endDateTime.getTime() / 1000),
        });
    };

    const handleCancel = () => {
        // Reset to original values
        if (selectedEvent) {
            setEditedTitle(selectedEvent.title || "");
            setEditedDescription(selectedEvent.description || "");
            const startDateTime = new Date(selectedEvent.start);
            const endDateTime = new Date(selectedEvent.end);
            const startStr = new Date(startDateTime.getTime() - startDateTime.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 16);
            const endStr = new Date(endDateTime.getTime() - endDateTime.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 16);
            setEditedStartDateTime(startStr);
            setEditedEndDateTime(endStr);
        }
        setIsEditing(false);
    };

    if (!selectedEvent || !calendarId) {
        return null;
    }

    const startTime = selectedEvent.start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    const endTime = selectedEvent.end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    const dateStr = selectedEvent.start.toLocaleDateString();

    return (
        <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col h-full">
            <div className="flex-1">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white">Google Calendar Event</h2>
                    <button
                        onClick={() => {
                            setSelectedEvent(null);
                            setRightSideBarView("Week");
                        }}
                        className="text-gray-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                {calendar && (
                    <div className="mb-4 flex items-center gap-2">
                        <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: calendar.color }}
                        />
                        <span className="text-sm text-gray-400">{calendar.name}</span>
                    </div>
                )}

                <div className="space-y-4">
                    {!isEditing ? (
                        <>
                            <div>
                                <label className="text-sm text-gray-400">Date & Time</label>
                                <div className="text-white mt-1">
                                    {dateStr} {startTime} - {endTime}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-400">Title</label>
                                <div className="text-white mt-1">{selectedEvent.title}</div>
                            </div>

                            {selectedEvent.description && (
                                <div>
                                    <label className="text-sm text-gray-400">Description</label>
                                    <div className="text-white mt-1 whitespace-pre-wrap">
                                        {selectedEvent.description}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="text-sm text-gray-400 mb-1 block">Title</label>
                                <input
                                    type="text"
                                    value={editedTitle}
                                    onChange={(e) => setEditedTitle(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                                    placeholder="Event title"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-gray-400 mb-1 block">Start Date & Time</label>
                                <input
                                    type="datetime-local"
                                    value={editedStartDateTime}
                                    onChange={(e) => setEditedStartDateTime(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-gray-400 mb-1 block">End Date & Time</label>
                                <input
                                    type="datetime-local"
                                    value={editedEndDateTime}
                                    onChange={(e) => setEditedEndDateTime(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-gray-400 mb-1 block">Description</label>
                                <textarea
                                    value={editedDescription}
                                    onChange={(e) => setEditedDescription(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white min-h-[100px]"
                                    placeholder="Event description"
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-700 space-y-2">
                {showDeleteConfirm ? (
                    <>
                        <p className="text-sm text-gray-300 mb-2">Are you sure you want to delete this event?</p>
                        <button
                            onClick={() => deleteEventMutation.mutate()}
                            disabled={deleteEventMutation.isPending}
                            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
                        >
                            {deleteEventMutation.isPending ? "Deleting..." : "Yes, Delete"}
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={deleteEventMutation.isPending}
                            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
                        >
                            Cancel
                        </button>
                    </>
                ) : !isEditing ? (
                    <>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                        >
                            Edit Event
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
                        >
                            Delete Event
                        </button>
                        <button
                            onClick={() => {
                                setSelectedEvent(null);
                                setRightSideBarView("Week");
                            }}
                            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                        >
                            Close
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={handleSave}
                            disabled={updateEventMutation.isPending}
                            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
                        >
                            {updateEventMutation.isPending ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={updateEventMutation.isPending}
                            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
                        >
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
