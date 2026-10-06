import {useEffect, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {finish_manual_timer, RunningManualTimer, start_manual_timer, stop_manual_timer, update_manual_timer_details} from "../../api/ManualTimeBlock.ts";
import {useToast} from "../../Componants/Toast.tsx";
import ProjectSelector from "../../Componants/ProjectSelector.tsx";

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
            <span className="flex items-center gap-2 px-1 font-mono text-sm tabular-nums text-sky-200" aria-label={timer.end_time == null ? "Timer running" : "Timer stopped"}>
                <span className={`h-1.5 w-1.5 rounded-full ${timer.end_time == null ? "bg-sky-400" : "bg-gray-500"}`} />
                {formatElapsed(timer.start_time, elapsedEnd)}
            </span>
            <button type="button" disabled={finishing} onClick={finish} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{finishing ? "Saving…" : timer.end_time == null ? "Done" : "Save time"}</button>
        </> : <button type="button" disabled={pending > 0} onClick={() => commit(title, projectId, true)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{pending > 0 ? "Starting…" : "Start"}</button>}
        <button type="button" onClick={(event) => onAddPastTime(event.currentTarget)} className="rounded-lg px-2 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white">Add past</button>
    </div>;
}
