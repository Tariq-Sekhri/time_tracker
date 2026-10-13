import {useQueryClient} from "@tanstack/react-query";
import {useAfkFilter} from "../stores/afkFilterStore.ts";
export default function AfkFilter() {
    const {excludeAfk, setExcludeAfk} = useAfkFilter();
    const client = useQueryClient();
    return <label className="inline-flex items-center gap-2 rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-200 cursor-pointer" title="Hides observed AFK time from tracked calendar blocks and statistics. Original records, unknown time, manual entries, and calendars are preserved.">
        <input type="checkbox" checked={excludeAfk} onChange={e => {
            const next=e.target.checked;
            void client.cancelQueries().then(() => {setExcludeAfk(next); return client.invalidateQueries();});
        }} className="accent-amber-500" />
        Exclude AFK
    </label>;
}
