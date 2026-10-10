import {useEffect, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {finish_manual_timer, RunningManualTimer, start_manual_timer, stop_manual_timer, update_manual_timer_details} from "../../api/ManualTimeBlock.ts";
import {useToast} from "../../Componants/Toast.tsx";
import ProjectSelector from "../../Componants/ProjectSelector.tsx";
import ManualPopover from "../../Componants/ManualPopover.tsx";

function toLocalDateTimeInput(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

function formatElapsed(startTime: number, now: number): string {
    const seconds = Math.max(0, Math.floor(now / 1000) - startTime);
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
        .map((value) => String(value).padStart(2, "0")).join(":");
}

export function ManualTimerControl({timer, onAddPastTime}: {timer: RunningManualTimer | null; onAddPastTime: (anchor: HTMLElement) => void}) {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const [now, setNow] = useState(Date.now());
    const [title, setTitle] = useState(timer?.title ?? "");
    const [projectId, setProjectId] = useState<number | null>(timer?.project_id ?? null);
    const [pending, setPending] = useState(0);
    const [finishing, setFinishing] = useState(false);
    const [startAnchor, setStartAnchor] = useState<HTMLElement | null>(null);
    const [startInput, setStartInput] = useState("");
    const [startError, setStartError] = useState<string | null>(null);
    const timerRef = useRef(timer);
    const pendingRef = useRef(0);
    const queue = useRef(Promise.resolve());
    const projectContainerRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (pendingRef.current) return;
        timerRef.current = timer;
        if (document.activeElement !== nameInputRef.current) setTitle(timer?.title ?? "");
        setProjectId(timer?.project_id ?? null);
    }, [timer]);

    useEffect(() => {
        if (!timer || timer.end_time != null) return;
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, [timer?.start_time, timer?.end_time]);

    const publish = (next: RunningManualTimer | null) => {
        timerRef.current = next;
        queryClient.setQueryData(["runningManualTimer"], next);
    };

    // Blur, project changes, and Done can arrive together. Save them in order.
    const enqueue = (operation: () => Promise<void>) => {
        pendingRef.current += 1;
        setPending((value) => value + 1);
        queue.current = queue.current.then(operation).catch((error) => {
            showToast("Could not save manual tracking", "error", 5000, String(error));
            void queryClient.invalidateQueries({queryKey: ["runningManualTimer"]});
        }).finally(() => {
            pendingRef.current -= 1;
            setPending((value) => value - 1);
        });
    };

    const commit = (name: string, project: number | null, forceStart = false) => {
        const nextTitle = name.trim();
        if (!nextTitle && !forceStart && !timerRef.current && !pendingRef.current) return;
        enqueue(async () => {
            const current = timerRef.current;
            if (!current) publish(await start_manual_timer(nextTitle, project));
            else if (current.title !== nextTitle || (current.project_id ?? null) !== project) {
                publish(await update_manual_timer_details(nextTitle, project));
            }
        });
    };

    const finish = () => {
        setStartAnchor(null);
        setFinishing(true);
        enqueue(async () => {
            try {
                if (!timerRef.current) return;
                publish(await update_manual_timer_details(title.trim(), projectId));
                publish(await stop_manual_timer());
                await finish_manual_timer();
                publish(null);
                setTitle("");
                setProjectId(null);
                await Promise.all(["manualTimeBlocks", "week_statistics", "day_statistics", "range_statistics", "total_statistics", "category_app_logs"].map((key) => queryClient.invalidateQueries({queryKey: [key]})));
                showToast("Time recorded", "success");
            } finally {setFinishing(false);}
        });
    };

    const saveStartTime = () => {
        const startTime = Math.floor(new Date(startInput).getTime() / 1000);
        const current = timerRef.current;
        if (!current) return;
        if (!Number.isFinite(startTime)) {setStartError("Choose a valid start time."); return;}
        if (startTime > Math.floor(Date.now() / 1000)) {setStartError("Start time cannot be in the future."); return;}
        if (current.end_time != null && startTime >= current.end_time) {setStartError("Start time must be before the end time."); return;}
        enqueue(async () => {
            const latest = timerRef.current;
            if (!latest) return;
            publish(await update_manual_timer_details(latest.title, latest.project_id ?? null, startTime));
            setStartAnchor(null);
            startAnchor?.focus();
        });
    };

    const elapsedEnd = timer?.end_time == null ? now : timer.end_time * 1000;
    return <div className={`flex max-w-full flex-wrap items-center gap-2 rounded-xl border p-2 ${timer ? "border-sky-800/70 bg-sky-950/20" : "border-gray-800 bg-gray-950"}`}>
        <input
            ref={nameInputRef}
            aria-label="Timer task name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => commit(title, projectId)}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    projectContainerRef.current?.querySelector("select")?.focus();
                }
                if (event.key === "Escape" && timerRef.current) setTitle(timerRef.current.title);
            }}
            maxLength={200}
            placeholder="What are you working on?"
            title="Enter a name, then Tab or click away to start tracking"
            disabled={finishing}
            className="w-52 min-w-0 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-sky-500 disabled:opacity-50"
        />
        <div ref={projectContainerRef} className="w-44">
            <ProjectSelector value={projectId} disabled={finishing} onChange={(id) => {
                setProjectId(id);
                if (timerRef.current || pendingRef.current) commit(title, id);
            }} />
        </div>
        {timer ? <>
            <button type="button" disabled={finishing} title="Edit start time" aria-haspopup="dialog" onClick={(event) => {
                setStartInput(toLocalDateTimeInput(timer.start_time));
                setStartError(null);
                setStartAnchor(event.currentTarget);
            }} className="flex items-center gap-2 rounded-lg px-2 py-2 font-mono text-sm tabular-nums text-sky-200 hover:bg-sky-900/40 disabled:opacity-50" aria-label={timer.end_time == null ? "Timer running: edit start time" : "Timer stopped: edit start time"}>
                <span className={`h-1.5 w-1.5 rounded-full ${timer.end_time == null ? "bg-sky-400" : "bg-gray-500"}`} />
                {formatElapsed(timer.start_time, elapsedEnd)}
            </button>
            <button type="button" disabled={finishing} onClick={finish} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{finishing ? "Saving…" : timer.end_time == null ? "Done" : "Save time"}</button>
        </> : <button type="button" disabled={pending > 0} onClick={() => commit(title, projectId, true)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{pending > 0 ? "Starting…" : "Start"}</button>}
        <button type="button" onClick={(event) => onAddPastTime(event.currentTarget)} className="rounded-lg px-2 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white">Add past</button>
        {startAnchor && timer && <ManualPopover anchor={startAnchor} onClose={() => setStartAnchor(null)} labelledBy="timer-start-title" width={340}>
            <form onSubmit={(event) => {event.preventDefault(); saveStartTime();}}>
                <h2 id="timer-start-title" className="mb-4 text-lg font-semibold">Edit start time</h2>
                <label className="block text-sm text-gray-300">Start time
                    <input autoFocus required type="datetime-local" step="1" value={startInput} max={toLocalDateTimeInput(timer.end_time == null ? Math.floor(now / 1000) : timer.end_time - 1)} onChange={(event) => {setStartInput(event.target.value); setStartError(null);}} className="mt-1 w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-white outline-none focus:border-sky-500" />
                </label>
                {startError && <p role="alert" className="mt-2 text-sm text-red-400">{startError}</p>}
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => {setStartAnchor(null); startAnchor.focus();}} className="rounded-lg bg-gray-800 px-3 py-2 text-sm hover:bg-gray-700">Cancel</button>
                    <button type="submit" disabled={pending > 0 || finishing} className="rounded-lg bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500 disabled:opacity-50">{pending > 0 ? "Saving…" : "Save"}</button>
                </div>
            </form>
        </ManualPopover>}
    </div>;
}
