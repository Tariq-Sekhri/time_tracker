import {type ReactNode} from "react";
import {useQuery} from "@tanstack/react-query";
import {invokeOrThrow} from "../../../utils";
import {type AfkBlockDetails,summarizeAfkEvidence} from "../../../afk/details";
import {type CalendarEvent} from "../types";
import {formatDuration} from "../utils";

export default function AfkBlockView({event,onClose,trailingToolbar}:{event:NonNullable<CalendarEvent>;onClose:()=>void;trailingToolbar?:ReactNode}) {
    const start=Math.floor(event.start.getTime()/1000),end=Math.floor(event.end.getTime()/1000);
    const query=useQuery({queryKey:["afkBlockDetails",event.afkDeviceUuid,start,end],queryFn:()=>invokeOrThrow<AfkBlockDetails>("get_afk_block_details",{deviceUuid:event.afkDeviceUuid,rangeStart:start,rangeEnd:end})});
    const summary=summarizeAfkEvidence(query.data?.evidence??[]);
    const groups=new Map<string,AfkBlockDetails["logs"]>();
    for(const log of query.data?.logs??[]) {const group=groups.get(log.app)??[];group.push(log);groups.set(log.app,group);}
    const clock=(timestamp:number)=>new Date(timestamp*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    return <section aria-label="AFK details" className="h-full min-h-0 overflow-y-auto nice-scrollbar border-l border-gray-700 p-5 text-gray-200">
        <header className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">AFK</h2><div className="flex gap-2">{trailingToolbar}<button onClick={onClose} aria-label="Close AFK details" className="rounded bg-gray-800 px-3 py-1">×</button></div></header>
        <p className="mt-2 text-sm text-gray-400">{event.afkDeviceName??"Device"} · {event.start.toLocaleDateString()} · {clock(start)}–{clock(end)}</p>
        {query.isPending&&<p className="mt-5">Loading AFK details…</p>}
        {query.error&&<p role="alert" className="mt-5 text-red-300">Could not load AFK details. <button className="underline" onClick={()=>void query.refetch()}>Retry</button></p>}
        {query.data&&<>
            <div className="my-5 grid grid-cols-2 gap-3 rounded bg-gray-900 p-3"><div><span className="text-xs text-gray-400">Recorded away time</span><p>{formatDuration(summary.seconds)}</p></div><div><span className="text-xs text-gray-400">Confidence score</span><p>{summary.confidence==null?"Unavailable":`${summary.confidence}%`}</p></div></div>
            <p className="text-xs text-gray-400">The score uses saved source states and settings, weighted by recorded time.</p>
            {summary.lockedSeconds>0&&<p className="mt-2 text-sm text-amber-200">Screen lock override observed for {formatDuration(summary.lockedSeconds)}.</p>}
            <h3 className="mt-5 font-semibold">Sources</h3>
            <div className="mt-2 space-y-2">{summary.sources.map(source=><div key={source.id} className="rounded bg-gray-900 p-2 text-sm"><div>{source.label}</div><div className="text-xs text-gray-400">{[
                source.active>0?`Active ${formatDuration(source.active)}`:null,
                source.known>source.active?`Inactive ${formatDuration(source.known-source.active)}`:null,
                source.known<summary.seconds?`Unavailable ${formatDuration(summary.seconds-source.known)}`:null,
                source.voting===0?"Not used in score":null,
            ].filter(Boolean).join(" · ")}</div></div>)}{!summary.sources.length&&<p className="text-sm text-gray-400">No recorded source evidence.</p>}</div>
            <h3 className="mt-5 font-semibold">Logs captured while away <span className="text-sm text-gray-400">({query.data.logs.length})</span></h3>
            <p className="mt-1 text-xs text-gray-400">Only this device's AFK logs. Recorded present time, unavailable-source intervals, and long recording gaps are excluded.</p>
            <div className="mt-3 space-y-2">{[...groups].sort((a,b)=>b[1].reduce((sum,l)=>sum+l.duration,0)-a[1].reduce((sum,l)=>sum+l.duration,0)).map(([app,logs])=><details key={app} className="rounded bg-gray-900 p-3"><summary className="cursor-pointer text-sm"><span className="break-words">{app}</span><span className="ml-2 text-gray-400">{formatDuration(logs.reduce((sum,log)=>sum+log.duration,0))}</span></summary><ul className="mt-2 space-y-1 text-xs text-gray-400">{logs.map((log,index)=><li key={`${log.id}-${log.timestamp}-${index}`}>{clock(log.timestamp)}–{clock(log.timestamp+log.duration)} · {formatDuration(log.duration)}</li>)}</ul></details>)}{!query.data.logs.length&&<p className="text-sm text-gray-400">No activity logs were captured during this away period.</p>}</div>
        </>}
    </section>;
}
