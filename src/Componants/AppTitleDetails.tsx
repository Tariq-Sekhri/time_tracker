import {useEffect, useRef, useState} from "react";
import {useRenderPerf} from "../perf.ts";
import {createPortal} from "react-dom";
import {useQuery} from "@tanstack/react-query";
import {get_log_by_id, get_logs_for_app_in_time_range} from "../api/Log.ts";
import {formatDuration} from "../Screens/Calander/utils.ts";
import {toErrorString} from "../types/common.ts";

type Props = {
    app: string;
    appNames?: string[];
    start: number;
    end: number;
    ids?: number[];
    deviceUuids?: string[] | null;
    minDuration?: number;
    className?: string;
    scopeLabel?: string;
};

export default function AppTitleDetails({app, appNames, start, end, ids, deviceUuids, minDuration = 1, className, scopeLabel}: Props) {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const {data: titles = [], isPending, error, refetch} = useQuery({
        queryKey: ["app_title_details", app, appNames, start, end, ids, deviceUuids, minDuration],
        enabled: open,
        queryFn: async () => {
            // Block IDs preserve the precise block and device membership, including attached logs.
            const logs = ids
                ? await Promise.all([...new Set(ids)].map((id) => get_log_by_id(id)))
                : await get_logs_for_app_in_time_range(app, start, end, minDuration);
            const totals = new Map<string, number>();
            for (const log of logs) {
                if (appNames && !appNames.includes(log.app)) continue;
                if (deviceUuids && (!log.device_uuid || !deviceUuids.includes(log.device_uuid))) continue;
                totals.set(log.app, (totals.get(log.app) ?? 0) + log.duration);
            }
            return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        },
    });

    useRenderPerf("app_title_details", open ? `open|${app}|${start}|${end}` : "closed", open && !isPending, 0,
        {source: ids ? "ids" : "range", ids: ids?.length ?? 0, titles: titles.length});

    useEffect(() => {
        const element = dialog.current;
        if (open) element?.showModal();
        return () => {
            if (element?.open) element.close();
            if (open) trigger.current?.focus();
        };
    }, [open]);

    if (appNames?.length === 0) return <span className={className}>{app}</span>;

    return <>
        <button ref={trigger} type="button" className={`${className ?? ""} text-left cursor-pointer hover:text-blue-300 focus-visible:outline-blue-400`}
                title={`View exact titles for ${app}`} aria-label={`View exact titles for ${app}`}
                onClick={(event) => {event.stopPropagation(); setOpen(true);}}>
            {app}
        </button>
        {open && createPortal(
            <dialog ref={dialog} aria-label={`${app} — exact titles`}
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0 w-[min(48rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto nice-scrollbar rounded-xl border border-gray-700 bg-gray-900 p-5 text-white backdrop:bg-black/70"
                    onCancel={() => setOpen(false)} onClose={() => setOpen(false)}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {event.stopPropagation(); if (event.target === event.currentTarget) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false);
                    }}}>
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold break-words">{app}</h2>
                        <p className="text-xs text-gray-400">Exact recorded titles · {scopeLabel ?? `${new Date(start * 1000).toLocaleString()} – ${new Date(end * 1000).toLocaleString()}`}</p>
                    </div>
                    <button autoFocus type="button" onClick={() => setOpen(false)} className="shrink-0 px-2 py-1 rounded hover:bg-gray-800" aria-label="Close title details">Close</button>
                </div>
                {isPending ? <p className="text-gray-400">Loading titles...</p> : error ?
                    <div role="alert"><p className="text-red-400 break-words">{toErrorString(error)}</p><button onClick={() => void refetch()} className="mt-2 text-blue-400">Retry</button></div> : <>
                        <p className="text-sm text-gray-400 mb-3">{titles.length} title{titles.length === 1 ? "" : "s"} · Total: {formatDuration(titles.reduce((sum, [, duration]) => sum + duration, 0))}</p>
                        {!titles.length && <p className="text-gray-400">No recorded titles in this selection.</p>}
                        <div className="space-y-2">
                            {titles.map(([title, duration]) => <div key={title} className="flex items-start justify-between gap-4 rounded bg-gray-800/70 p-3">
                                <span className="text-sm whitespace-pre-wrap break-words min-w-0 select-text">{title}</span>
                                <span className="text-sm text-gray-400 shrink-0">{formatDuration(duration)}</span>
                            </div>)}
                        </div>
                    </>}
            </dialog>, document.body)}
    </>;
}
