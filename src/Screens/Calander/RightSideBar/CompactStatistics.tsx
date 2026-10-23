import {formatDuration} from "../utils";

type CompactCategory = {category: string; total_duration: number; color: string | null; source: string};

/** Uses the full panel's filtered statistics in the collapsed rail. */
export default function CompactStatistics({period, totalTime, categories, loading, error, onExpand, onCategoryClick}: {
    period: "Week" | "Day";
    totalTime: number;
    categories: CompactCategory[];
    loading: boolean;
    error: boolean;
    onExpand: () => void;
    onCategoryClick?: (category: string) => void;
}) {
    return <section aria-label={`${period} summary`} className="flex w-full flex-col items-center gap-3 border-t border-gray-800 pt-3">
        <button type="button" onClick={onExpand} title={`Open ${period.toLowerCase()} statistics${loading || error ? "" : `: ${formatDuration(totalTime)}`}`}
                className="flex w-full flex-col items-center gap-1 rounded-md py-1 text-gray-400 hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2">
            <span className="text-[9px] uppercase tracking-wider">{period}</span>
            <span className="text-xs font-semibold tabular-nums text-gray-100" aria-live="polite">
                {error ? "!" : loading ? "…" : totalTime >= 3600 ? `${(totalTime / 3600).toFixed(1)}h` : formatDuration(totalTime)}
            </span>
        </button>
        {error ? <span role="status" className="text-center text-[10px] text-red-400">Stats unavailable</span>
            : loading ? <span role="status" className="text-[10px] text-gray-500">Loading</span>
            : categories.length === 0 ? <span className="text-center text-[10px] text-gray-500">No activity</span>
            : <div className="flex w-full flex-col items-center gap-2" aria-label="Top categories">
                {categories.map((category, index) => {
                    const title = `${category.category}: ${formatDuration(category.total_duration)}${totalTime > 0 ? ` (${Math.round(category.total_duration / totalTime * 100)}%)` : ""}`;
                    return <button key={`${category.source}:${category.category}:${index}`} type="button" title={title} aria-label={title}
                                   onClick={() => category.source === "tracking" && onCategoryClick ? onCategoryClick(category.category) : onExpand()}
                                   className="group flex w-full flex-col items-center gap-1 rounded-md py-1 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2">
                        <span className="h-3.5 w-3.5 rounded-full transition-transform group-hover:scale-110" style={{backgroundColor: category.color || "var(--tt-subtle)"}}/>
                        <span className="text-[10px] leading-tight tabular-nums text-gray-400 group-hover:text-white">{formatDuration(category.total_duration).split(" ").map((part, i) => <span key={i} className="block">{part}</span>)}</span>
                    </button>;
                })}
            </div>}
    </section>;
}
