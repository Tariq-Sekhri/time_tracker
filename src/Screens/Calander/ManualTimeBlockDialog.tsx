import {useEffect, useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {insert_manual_time_block} from "../../api/ManualTimeBlock.ts";
import {useToast} from "../../Componants/Toast.tsx";

function toLocalDateTimeInput(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ManualTimeBlockDialog({
    open,
    initialStart,
    onClose,
}: {
    open: boolean;
    initialStart: Date;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const roundedStart = new Date(initialStart);
        roundedStart.setSeconds(0, 0);
        const roundedMinutes = Math.ceil(roundedStart.getMinutes() / 15) * 15;
        roundedStart.setMinutes(roundedMinutes, 0, 0);
        const defaultEnd = new Date(roundedStart.getTime() + 60 * 60 * 1000);
        setTitle("");
        setNotes("");
        setStart(toLocalDateTimeInput(roundedStart));
        setEnd(toLocalDateTimeInput(defaultEnd));
        setValidationError(null);
    }, [open, initialStart]);

    const createMutation = useMutation({
        mutationFn: insert_manual_time_block,
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["manualTimeBlocks"]});
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
        if (!title.trim()) {
            setValidationError("Add a title for this time block.");
            return;
        }
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
            start_time: Math.floor(startDate.getTime() / 1000),
            end_time: Math.floor(endDate.getTime() / 1000),
        });
    };

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-4" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="manual-time-title"
                className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-950 p-6 shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                        <h2 id="manual-time-title" className="text-xl font-semibold text-white">Track time manually</h2>
                        <p className="mt-1 text-sm text-gray-400">Creates an editable calendar block without activity logs.</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-white" aria-label="Close">×</button>
                </div>

                <div className="space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-300">Title</span>
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
                        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Optional details" className="w-full resize-y rounded-lg border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-sky-500" />
                    </label>
                    {validationError ? <p className="text-sm text-red-400">{validationError}</p> : null}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700">Cancel</button>
                    <button type="button" onClick={save} disabled={createMutation.isPending} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60">
                        {createMutation.isPending ? "Adding…" : "Add time"}
                    </button>
                </div>
            </div>
        </div>
    );
}
