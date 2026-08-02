import {useEffect, useState, type ReactNode} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {delete_manual_time_block, update_manual_time_block} from "../../../api/ManualTimeBlock.ts";
import {useToast} from "../../../Componants/Toast.tsx";
import {formatDuration} from "../utils.ts";
import type {CalendarEvent} from "../types.ts";

function toLocalDateTimeInput(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ManualTimeBlockView({
    selectedEvent,
    setSelectedEvent,
    setRightSideBarView,
    trailingToolbar,
}: {
    selectedEvent: NonNullable<CalendarEvent>;
    setSelectedEvent: (event: CalendarEvent) => void;
    setRightSideBarView: (view: "Week" | "Day" | "Event" | "CategoryFilter") => void;
    trailingToolbar?: ReactNode;
}) {
    const id = selectedEvent.manualTimeBlockId;
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [title, setTitle] = useState(selectedEvent.title);
    const [notes, setNotes] = useState(selectedEvent.notes ?? "");
    const [start, setStart] = useState(toLocalDateTimeInput(selectedEvent.start));
    const [end, setEnd] = useState(toLocalDateTimeInput(selectedEvent.end));
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        setTitle(selectedEvent.title);
        setNotes(selectedEvent.notes ?? "");
        setStart(toLocalDateTimeInput(selectedEvent.start));
        setEnd(toLocalDateTimeInput(selectedEvent.end));
        setValidationError(null);
    }, [selectedEvent]);

    const updateMutation = useMutation({
        mutationFn: update_manual_time_block,
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["manualTimeBlocks"]});
            const startDate = new Date(start);
            const endDate = new Date(end);
            setSelectedEvent({...selectedEvent, title: title.trim(), notes: notes.trim() || undefined, start: startDate, end: endDate});
            setIsEditing(false);
            showToast("Manual time updated", "success");
        },
        onError: (error) => showToast("Failed to update manual time", "error", 5000, String(error)),
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (id == null) throw new Error("Missing manual time block ID");
            return delete_manual_time_block(id);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["manualTimeBlocks"]});
            setSelectedEvent(null);
            setRightSideBarView("Week");
            showToast("Manual time deleted", "success");
        },
        onError: (error) => showToast("Failed to delete manual time", "error", 5000, String(error)),
    });

    if (id == null) return null;

    const close = () => {
        setSelectedEvent(null);
        setRightSideBarView("Week");
    };

    const save = () => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (!title.trim()) {
            setValidationError("Add a title for this time block.");
            return;
        }
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
            setValidationError("End time must be after start time.");
            return;
        }
        setValidationError(null);
        updateMutation.mutate({
            id,
            title: title.trim(),
            notes: notes.trim() || null,
            start_time: Math.floor(startDate.getTime() / 1000),
            end_time: Math.floor(endDate.getTime() / 1000),
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-gray-700 bg-black p-6 nice-scrollbar">
            <div className="flex items-center justify-between gap-2">
                <h2 className="truncate text-xl font-bold text-white">Manual time</h2>
                <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={close} className="text-gray-400 hover:text-white" aria-label="Close">×</button>
                    {trailingToolbar}
                </div>
            </div>

            {isEditing ? (
                <div className="mt-5 space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-sm text-gray-400">Title</span>
                        <input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-sky-500" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm text-gray-400">Start</span>
                        <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-sky-500" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm text-gray-400">End</span>
                        <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-sky-500" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm text-gray-400">Description or notes</span>
                        <textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-sky-500" />
                    </label>
                    {validationError ? <p className="text-sm text-red-400">{validationError}</p> : null}
                    <div className="flex gap-2">
                        <button type="button" onClick={save} disabled={updateMutation.isPending} className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60">{updateMutation.isPending ? "Saving…" : "Save"}</button>
                        <button type="button" onClick={() => setIsEditing(false)} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700">Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="mt-5 flex flex-1 flex-col">
                    <div>
                        <h3 className="break-words text-lg font-semibold text-white">{selectedEvent.title}</h3>
                        <p className="mt-2 text-sm text-gray-400">{selectedEvent.start.toLocaleString()} – {selectedEvent.end.toLocaleString()}</p>
                        <p className="mt-1 text-sm font-medium text-sky-400">{formatDuration(Math.floor((selectedEvent.end.getTime() - selectedEvent.start.getTime()) / 1000))}</p>
                        <div className="mt-5 border-t border-gray-800 pt-5">
                            <h4 className="text-sm font-medium text-gray-400">Description or notes</h4>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-200">{selectedEvent.notes || "No notes"}</p>
                        </div>
                        <div className="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-400">This manual block has no captured app logs.</div>
                    </div>
                    <div className="mt-auto space-y-2 border-t border-gray-800 pt-5">
                        <button type="button" onClick={() => setIsEditing(true)} className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">Edit</button>
                        {showDeleteConfirm ? (
                            <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3">
                                <p className="mb-3 text-sm text-red-200">Delete this manual time block?</p>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="flex-1 rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-60">Delete</button>
                                    <button type="button" onClick={() => setShowDeleteConfirm(false)} className="rounded bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm text-red-400 hover:bg-red-950/50">Delete</button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
