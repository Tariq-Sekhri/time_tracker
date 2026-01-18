import { CalendarEvent, EventLogs } from "../types.ts";
import { formatTime, formatDuration } from "../utils.ts";
import { count_logs_for_time_block, delete_logs_for_time_block } from "../../../api/Log.ts";
import { useState } from "react"
import { unwrapResult } from "../../../utils.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SideBarView } from "./RightSideBar.tsx";

export type SelectedEvent = {
    title: string
    start: Date
    end: Date
    apps: {
        app: string
        totalDuration: number
    }[]
}


export default function AppsInTimeBlock({
    selectedEvent,
    setSelectedEvent,
    selectedEventLogs,
    setSelectedEventLogs,
    setRightSideBarView
}: {
    selectedEvent: SelectedEvent,
    setSelectedEvent: (newEvent: CalendarEvent) => void,
    selectedEventLogs: EventLogs,
    setSelectedEventLogs: (newLogs: EventLogs) => void,
    setRightSideBarView: (newView: SideBarView) => void
}) {
    const queryClient = useQueryClient();

    // Delete confirmation state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteLogCount, setDeleteLogCount] = useState(0);
    const [isCountingLogs, setIsCountingLogs] = useState(false);

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
            setRightSideBarView("Week");
        },
    });

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

    // Safety check - if selectedEvent is null, don't render
    if (!selectedEvent) {
        return null;
    }

    const sortedLogs = [...selectedEventLogs].sort((a, b) => b.duration - a.duration);
    const totalDuration = sortedLogs.reduce((sum, log) => sum + log.duration, 0);

    return (
        <div className="w-80 border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-bold text-white">{selectedEvent.title}</h2>
                    <button
                        onClick={() => {
                            setRightSideBarView("Week");
                            setSelectedEvent(null);
                            setSelectedEventLogs([]);
                        }}
                        className="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="text-sm text-gray-400 mb-1">
                    {formatTime(selectedEvent.start)} - {formatTime(selectedEvent.end)}
                </div>
                <div className="text-xs text-gray-500">
                    Total: {formatDuration(totalDuration)}
                </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-700 mb-6 flex-shrink-0" />

            {/* App Logs List */}
            <div className="flex-1 overflow-y-auto mb-6">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">App Activity</h3>
                {sortedLogs.length === 0 ? (
                    <div className="text-gray-500 text-sm">No app activity recorded</div>
                ) : (
                    <div className="space-y-2">
                        {sortedLogs.map((log, idx) => (
                            <div
                                key={idx}
                                className="bg-gray-900 rounded-lg p-3 hover:bg-gray-800 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-white truncate flex-1">
                                        {log.app}
                                    </span>
                                    <span className="text-sm text-gray-400 ml-2 flex-shrink-0">
                                        {formatDuration(log.duration)}
                                    </span>
                                </div>
                                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-600"
                                        style={{
                                            width: `${totalDuration > 0 ? (log.duration / totalDuration) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Button - Fixed at bottom */}
            <div className="flex-shrink-0 pt-4 border-t border-gray-700">
                <button
                    onClick={handleDeleteClick}
                    disabled={isCountingLogs || deleteTimeBlockMutation.isPending}
                    className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:opacity-50 rounded text-white font-medium transition-colors flex items-center justify-center gap-2"
                >
                    {isCountingLogs ? (
                        <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                    strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Counting logs...
                        </>
                    ) : deleteTimeBlockMutation.isPending ? (
                        <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                    strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Deleting...
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete Time Block
                        </>
                    )}
                </button>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white">Confirm Delete</h3>
                        <p className="text-gray-300 mb-2">
                            This will permanently delete <span
                                className="text-red-400 font-semibold">{deleteLogCount} log{deleteLogCount !== 1 ? 's' : ''}</span> from
                            this time block.
                        </p>
                        {deleteLogCount > 0 && (
                            <p className="text-yellow-400 text-sm mb-4">
                                ⚠️ This action cannot be undone!
                            </p>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deleteTimeBlockMutation.isPending}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
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