import type {AfkInterval} from "./model.ts";
/** Coalesce labels only; stored evidence is retained at its original resolution. */
export function afkSpans(intervals: AfkInterval[], start: number, end: number) {
    const sorted=intervals.filter(i=>i.state===2&&i.end_time>start&&i.start_time<end)
        .map(i=>({device:i.device_uuid,start:Math.max(start,i.start_time),end:Math.min(end,i.end_time)}))
        .sort((a,b)=>a.device.localeCompare(b.device)||a.start-b.start);
    const spans: typeof sorted=[];
    for (const span of sorted) {
        const previous=spans[spans.length-1];
        if (previous&&previous.device===span.device&&previous.end>=span.start) previous.end=Math.max(previous.end,span.end);
        else spans.push({...span});
    }
    return spans;
}

export function continuousAway(intervals:AfkInterval[]):AfkInterval[] {
    const ordered=[...intervals].sort((a,b)=>a.device_uuid.localeCompare(b.device_uuid)||a.start_time-b.start_time);
    const result:AfkInterval[]=[];let previousAway=false;
    for(const interval of ordered) {
        if(interval.state!==2){previousAway=false;continue;}
        const previous=result[result.length-1];
        if(previousAway&&previous?.device_uuid===interval.device_uuid&&interval.start_time<=previous.end_time+5){previous.end_time=Math.max(previous.end_time,interval.end_time);continue;}
        result.push({...interval});previousAway=true;
    }
    return result;
}

export function subtractAfk<T extends {device_uuid?: string | null; timestamp:number; duration:number}>(logs:T[],intervals:AfkInterval[]):T[] {
    const byDevice=new Map<string,ReturnType<typeof afkSpans>>();
    for(const span of afkSpans(continuousAway(intervals),-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)) {
        const spans=byDevice.get(span.device)??[];spans.push(span);byDevice.set(span.device,spans);
    }
    return logs.flatMap(log=>{
        const spans=byDevice.get(log.device_uuid??"");if(!spans)return [{...log}];
        const stop=log.timestamp+log.duration; let cursor=log.timestamp;const result:T[]=[];
        for(const span of spans) {
            if(span.end<=cursor)continue;if(span.start>=stop)break;
            if(span.start>cursor)result.push({...log,timestamp:cursor,duration:span.start-cursor});
            cursor=Math.max(cursor,span.end);if(cursor>=stop)break;
        }
        if(cursor<stop)result.push({...log,timestamp:cursor,duration:stop-cursor});
        return result;
    });
}
