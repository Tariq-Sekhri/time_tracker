import {useEffect, useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {finish_manual_timer, RunningManualTimer, start_manual_timer, stop_manual_timer, update_manual_timer_title} from "../../api/ManualTimeBlock.ts";
import {useToast} from "../../Componants/Toast.tsx";

function formatElapsed(startTime: number, now: number): string {
    const seconds = Math.max(0, Math.floor(now / 1000) - startTime);
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
}

export function ManualTimerControl({timer, onAddPastTime}: {timer: RunningManualTimer | null; onAddPastTime: () => void}) {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const [now, setNow] = useState(Date.now());
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [title, setTitle] = useState("");
    const [showFinishDialog, setShowFinishDialog] = useState(false);
    const stopMutation = useMutation({
        mutationFn: stop_manual_timer,
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["runningManualTimer"]});
            setShowFinishDialog(true);
        },
        onError: (error) => showToast("Could not stop timer", "error", 5000, String(error)),
    });

    useEffect(() => {
        if (!timer || timer.end_time != null) return;
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, [timer]);

    useEffect(() => {
        setTitle(timer?.title ?? "");
        setIsEditingTitle(false);
    }, [timer?.title]);

    const startMutation = useMutation({
        mutationFn: start_manual_timer,
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["runningManualTimer"]});
            showToast("Timer started", "success");
        },
        onError: (error) => showToast("Could not start timer", "error", 5000, String(error)),
    });
    const updateTitleMutation = useMutation({
        mutationFn: () => update_manual_timer_title(title.trim()),
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["runningManualTimer"]});
            setIsEditingTitle(false);
        },
        onError: (error) => showToast("Could not rename timer", "error", 5000, String(error)),
    });

    if (!timer) {
        return <div className="flex items-center rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-sm">
            <button type="button" disabled={startMutation.isPending} className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60" onClick={() => startMutation.mutate()}>{startMutation.isPending ? "Starting..." : "Start timer"}</button>
            <button type="button" className="px-2.5 py-1.5 text-sm font-medium text-gray-300 transition hover:text-white" onClick={onAddPastTime}>Add past time</button>
        </div>;
    }

    const saveTitle = () => {
        if (!title.trim() || title.trim() === timer.title) {
            setTitle(timer.title);
            setIsEditingTitle(false);
            return;
        }
        updateTitleMutation.mutate();
    };
    const elapsedEnd = timer.end_time == null ? now : timer.end_time * 1000;

    return <>
        <div className="flex min-w-0 items-center rounded-lg border border-sky-800/80 bg-gray-900 p-1 shadow-sm">
            <span className="mx-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" aria-label="Timer running" />
            {isEditingTitle ? <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === "Enter") saveTitle(); if (event.key === "Escape") { setTitle(timer.title); setIsEditingTitle(false); } }} maxLength={200} className="w-36 rounded border border-sky-500 bg-black px-1.5 py-1 text-sm text-white outline-none" aria-label="Timer task name" disabled={updateTitleMutation.isPending} /> :
                <button type="button" onClick={() => setIsEditingTitle(true)} className={`max-w-36 truncate px-1 py-1 text-left text-sm font-semibold ${timer.title ? "text-white hover:text-sky-200" : "text-sky-300 hover:text-sky-100"}`} title="Rename timer">{timer.title || "Add task name"}</button>}
            <span className="border-l border-gray-700 px-2 font-mono text-sm tabular-nums text-sky-200">{formatElapsed(timer.start_time, elapsedEnd)}</span>
            {timer.end_time == null ? <button type="button" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate()} className="rounded-md bg-sky-600 px-2.5 py-1 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60">{stopMutation.isPending ? "Stopping..." : "Done"}</button> : <button type="button" onClick={() => setShowFinishDialog(true)} className="rounded-md bg-sky-600 px-2.5 py-1 text-sm font-semibold text-white transition hover:bg-sky-500">Save time</button>}
            <button type="button" className="px-2 py-1 text-sm font-medium text-gray-400 transition hover:text-white" onClick={onAddPastTime}>Add past</button>
        </div>
        <FinishManualTimerDialog open={showFinishDialog} initialTitle={timer.title} onClose={() => setShowFinishDialog(false)} />
    </>;
}

function FinishManualTimerDialog({open, initialTitle, onClose}: {open: boolean; initialTitle: string; onClose: () => void}) {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const [title, setTitle] = useState("");
    const [error, setError] = useState<string | null>(null);
    const mutation = useMutation({
        mutationFn: async () => { await update_manual_timer_title(title.trim()); return finish_manual_timer(); },
        onSuccess: async () => {
            await Promise.all([queryClient.invalidateQueries({queryKey: ["runningManualTimer"]}), queryClient.invalidateQueries({queryKey: ["manualTimeBlocks"]})]);
            showToast("Timer recorded", "success");
            onClose();
        },
        onError: (value) => showToast("Could not record timer", "error", 5000, String(value)),
    });
    useEffect(() => { if (open) { setTitle(initialTitle); setError(null); } }, [open, initialTitle]);
    if (!open) return null;
    const finish = () => {
        if (!title.trim()) { setError("Add a name for this time block."); return; }
        setError(null); mutation.mutate();
    };
    return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-4" onMouseDown={onClose}>
        <div role="dialog" aria-modal="true" aria-labelledby="finish-timer-title" className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-950 p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="finish-timer-title" className="text-xl font-semibold text-white">What did you work on?</h2>
            <p className="mt-1 text-sm text-gray-400">Give this completed time block a name.</p>
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") finish(); if (event.key === "Escape") onClose(); }} maxLength={200} placeholder="e.g. Client project planning" className="mt-5 w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-sky-500" />
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-6 flex justify-end"><button type="button" disabled={mutation.isPending} onClick={finish} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">{mutation.isPending ? "Saving..." : "Save time"}</button></div>
        </div>
    </div>;
}
