import {manualTimeQueryKeys, type ManualTimeDraft} from "./manualCalendarEditing.ts";
import {useEffect, useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {insert_manual_time_block} from "../../api/ManualTimeBlock.ts";
import {useToast} from "../../Componants/Toast.tsx";
import ProjectSelector from "../../Componants/ProjectSelector.tsx";
import ManualPopover from "../../Componants/ManualPopover.tsx";

function toLocalDateTimeInput(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ManualTimeBlockDialog({
    open,
    initialStart,
    initialEnd,
    onPreviewChange,
    manipulating = false,
    onClose,
    anchor,
}: {
    open: boolean;
    initialStart: Date;
    initialEnd?: Date;
    manipulating?: boolean;
    onPreviewChange?: (draft: ManualTimeDraft) => void;
    onClose: () => void;
    anchor: HTMLElement | null;
}) {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [projectId, setProjectId] = useState<number | null>(null);
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setTitle("");
        setNotes("");
        setProjectId(null);
        setValidationError(null);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        setStart(toLocalDateTimeInput(initialStart));
        setEnd(toLocalDateTimeInput(initialEnd ?? new Date(initialStart.getTime() + 3600000)));
    }, [open, initialStart, initialEnd]);

    useEffect(() => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (open && Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime()) && endDate > startDate) {
            onPreviewChange?.({start: startDate, end: endDate, title});
        }
    }, [open, start, end, title, onPreviewChange]);

    const createMutation = useMutation({
        mutationFn: insert_manual_time_block,
        onSuccess: async () => {
            await Promise.all(manualTimeQueryKeys.map((key) => queryClient.invalidateQueries({queryKey: [key]})));
            showToast("Manual time added", "success");
            onClose();
        },
        onError: (error) => {
            showToast("Failed to add manual time", "error", 5000, String(error));
        },
    });

    if (!open) return null;

    const save = () => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            setValidationError("Choose a valid start and end time.");
            return;
        }
        if (endDate <= startDate) {
            setValidationError("End time must be after start time.");
            return;
        }
        setValidationError(null);
        createMutation.mutate({
            title: title.trim(),
            notes: notes.trim() || null,
            project_id: projectId,
            start_time: Math.floor(startDate.getTime() / 1000),
            end_time: Math.floor(endDate.getTime() / 1000),
        });
    };

    return (
        <ManualPopover anchor={anchor} onClose={onClose} labelledBy="manual-time-title" width={420} suspended={manipulating} beside={anchor?.tagName !== "BUTTON"} positionKey={`${initialStart.getTime()}-${initialEnd?.getTime()}`} ignoreOutsideSelector=".tt-manual-draft, .fc-event-mirror">
            <div>
                <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                        <h2 id="manual-time-title" className="text-xl font-semibold text-white">New time entry</h2>
                        <p className="mt-1 text-sm text-gray-400">Drag the preview to move it, or its edge to resize.</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-white" aria-label="Close">×</button>
                </div>

                <div className="space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-300">Name (optional)</span>
                        <input
                            autoFocus
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") save();
                                if (event.key === "Escape") onClose();
                            }}
                            maxLength={200}
                            placeholder="What did you work on?"
                            className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-sky-500"
                        />
                    </label>
                    <div>
                        <span className="mb-1 block text-sm font-medium text-gray-300">Category</span>
                        <ProjectSelector value={projectId} onChange={setProjectId} disabled={createMutation.isPending} showManage={false} />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-300">Start</span>
                            <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-sky-500" />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-300">End</span>
                            <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-sky-500" />
                        </label>
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-300">Description or notes</span>
                        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Optional details" className="w-full resize-y rounded-lg border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-sky-500" />
                    </label>
                    {validationError ? <p className="text-sm text-red-400">{validationError}</p> : null}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700">Cancel</button>
                    <button type="button" onClick={save} disabled={createMutation.isPending} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60">
                        {createMutation.isPending ? "Adding…" : "Save"}
                    </button>
                </div>
            </div>
        </ManualPopover>
    );
}
