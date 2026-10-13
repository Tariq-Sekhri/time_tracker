import {AFK_SOURCES,evaluateAfk,type AfkSettings} from "./model";
export type AfkEvidence={start_time:number;end_time:number;known_mask:number;active_mask:number;settings:AfkSettings};
export type AfkBlockDetails={device_uuid:string;evidence:AfkEvidence[];logs:{id:number;device_uuid:string;app:string;timestamp:number;duration:number}[]};
export function summarizeAfkEvidence(evidence:AfkEvidence[]) {
    let seconds=0,weightedScore=0,lockedSeconds=0;
    const sources=AFK_SOURCES.map(source=>({...source,known:0,active:0,voting:0}));
    for(const e of evidence) {
        const duration=Math.max(0,e.end_time-e.start_time);seconds+=duration;
        const observations=AFK_SOURCES.map((_,i)=>({available:Boolean(e.known_mask&(1<<i)),active:Boolean(e.active_mask&(1<<i)),idle_seconds:null,detail:"Recorded evidence"}));
        weightedScore+=evaluateAfk(e.settings,observations).away_score*duration;
        if(e.settings.locked_is_away&&observations[8].available&&observations[8].active)lockedSeconds+=duration;
        sources.forEach((source,i)=>{
            if(!observations[i].available)return;
            source.known+=duration;if(observations[i].active)source.active+=duration;
            if(e.settings.sources[i]?.enabled&&e.settings.sources[i]?.weight>0)source.voting+=duration;
        });
    }
    return {seconds,confidence:seconds?Math.round(weightedScore/seconds):null,lockedSeconds,sources:sources.filter(source=>source.known>0)};
}
