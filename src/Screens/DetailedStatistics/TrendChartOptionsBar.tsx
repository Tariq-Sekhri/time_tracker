import type {TrendSeriesMode, TrendValueMode} from "./CategoryWeekTrendChart.tsx";

export const STATS_TOOLBAR_CONTROL_HEIGHT =
    "h-10 min-h-10 flex items-center shrink-0";

type TrendChartOptionsBarProps = {    valueMode: TrendValueMode;
    onValueModeChange: (mode: TrendValueMode) => void;
    showTotalLine: boolean;
    onShowTotalLineChange: (show: boolean) => void;
    seriesMode: TrendSeriesMode;
    onSeriesModeChange: (mode: TrendSeriesMode) => void;
    topAppCount: number;
    onTopAppCountChange: (count: number) => void;
};

export default function TrendChartOptionsBar({
                                               valueMode,
                                               onValueModeChange,
                                               showTotalLine,
                                               onShowTotalLineChange,
                                               seriesMode,
                                               onSeriesModeChange,
                                               topAppCount,
                                               onTopAppCountChange,
                                           }: TrendChartOptionsBarProps) {
    return (
        <div
            className={`${STATS_TOOLBAR_CONTROL_HEIGHT} flex-wrap gap-3 px-3 bg-gray-800 border border-gray-700 rounded`}
        >
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-400 shrink-0">Values</span>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                        type="radio"
                        name="trend-value-mode"
                        checked={valueMode === "avg"}
                        onChange={() => onValueModeChange("avg")}
                        className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm text-gray-200">Daily average</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                        type="radio"
                        name="trend-value-mode"
                        checked={valueMode === "total"}
                        onChange={() => onValueModeChange("total")}
                        className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm text-gray-200">Week total</span>
                </label>
            </div>
            <div className="hidden sm:block w-px h-5 bg-gray-600 shrink-0" aria-hidden />
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                    type="checkbox"
                    checked={showTotalLine}
                    onChange={(e) => onShowTotalLineChange(e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-sm text-gray-200">Show total line</span>
            </label>
            <div className="hidden lg:block w-px h-5 bg-gray-600 shrink-0" aria-hidden />
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm text-gray-400">Show</span>
                <div className="flex p-0.5 bg-gray-900 rounded border border-gray-700">
                    <button
                        type="button"
                        onClick={() => onSeriesModeChange("categories")}
                        className={`px-2 py-1 text-sm rounded transition-colors ${seriesMode === "categories" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                    >
                        Categories
                    </button>
                    <button
                        type="button"
                        onClick={() => onSeriesModeChange("topApps")}
                        className={`px-2 py-1 text-sm rounded transition-colors ${seriesMode === "topApps" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                    >
                        Top apps
                    </button>
                </div>
                {seriesMode === "topApps" && (
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Count</span>
                        <select
                            value={topAppCount}
                            onChange={(e) => onTopAppCountChange(Number(e.target.value))}
                            className="h-8 bg-gray-900 border border-gray-700 rounded px-2 text-sm text-gray-200 cursor-pointer"
                            aria-label="Number of top apps to show"
                        >
                            {[3, 5, 10, 15, 20].map((count) => (
                                <option key={count} value={count}>Top {count}</option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
        </div>
    );
}
