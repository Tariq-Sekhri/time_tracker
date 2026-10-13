import {useQueryClient} from "@tanstack/react-query";
import {useAfkFilter} from "../stores/afkFilterStore.ts";
export default function AfkFilter() {
    const {excludeAfk, setExcludeAfk} = useAfkFilter();
    const client = useQueryClient();
    return <label className="inline-flex items-center gap-2 rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-200 cursor-pointer" title="Show grouped AFK blocks. Click one to inspect its sources, confidence, and captured logs. Away logs stay out of normal activity and statistics; manual entries and calendar events are preserved.">
        <input type="checkbox" checked={!excludeAfk} onChange={e => {
            const next=!e.target.checked;
            void client.cancelQueries().then(() => {setExcludeAfk(next); return client.invalidateQueries();});
        }} className="accent-amber-500" />
        Include AFK
    </label>;
}
