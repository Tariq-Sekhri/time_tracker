import {useQuery} from "@tanstack/react-query";
import {invokeOrThrow} from "../../utils";
import {type AfkBlockDetails} from "../../afk/details";
import {formatDuration} from "./utils";

/** Rendered by FullCalendar inside the AFK event's own content element. */
export default function AfkEventContent({device,start,end,timeText}:{device:string;start:number;end:number;timeText:string}) {
    const query=useQuery({queryKey:["afkBlockDetails",device,start,end],queryFn:()=>invokeOrThrow<AfkBlockDetails>("get_afk_block_details",{deviceUuid:device,rangeStart:start,rangeEnd:end})});
    const groups=new Map<string,AfkBlockDetails["logs"]>();
    for(const log of query.data?.logs??[]) {const group=groups.get(log.app)??[];group.push(log);groups.set(log.app,group);}
    const clock=(timestamp:number)=>new Date(timestamp*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    return <div className="tt-afk-card" data-afk-inline>
        <div className="tt-afk-card-heading"><strong>AFK · {formatDuration(end-start)}</strong><span>{timeText}</span></div>
        <div className="tt-afk-card-logs" aria-label="Captured logs inside AFK block">
            {query.isPending&&<div className="tt-afk-card-note">Loading captured logs…</div>}
            {query.error&&<button className="tt-afk-card-note" onClick={event=>{event.stopPropagation();void query.refetch();}}>Retry captured logs</button>}
            {query.data&&!query.data.logs.length&&<div className="tt-afk-card-note">No captured logs</div>}
            {[...groups].sort((a,b)=>b[1].reduce((sum,l)=>sum+l.duration,0)-a[1].reduce((sum,l)=>sum+l.duration,0)).map(([app,logs])=><details key={app} className="tt-afk-child-log" onClick={event=>event.stopPropagation()}>
                <summary title={app}><span>{app}</span><span>{formatDuration(logs.reduce((sum,log)=>sum+log.duration,0))}</span></summary>
                <ul>{logs.map((log,index)=><li key={`${log.id}-${log.timestamp}-${index}`}>{clock(log.timestamp)}–{clock(log.timestamp+log.duration)} · {formatDuration(log.duration)}</li>)}</ul>
            </details>)}
        </div>
    </div>;
}
