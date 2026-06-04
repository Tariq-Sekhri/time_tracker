import type {TrendValueMode} from "./CategoryWeekTrendChart.tsx";

export const STATS_TOOLBAR_CONTROL_HEIGHT =
    "h-10 min-h-10 flex items-center shrink-0";

type TrendChartOptionsBarProps = {    valueMode: TrendValueMode;
    onValueModeChange: (mode: TrendValueMode) => void;
    showTotalLine: boolean;
    onShowTotalLineChange: (show: boolean) => void;
};

export default function TrendChartOptionsBar({
                                               valueMode,
                                               onValueModeChange,
                                               showTotalLine,
                                               onShowTotalLineChange,
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
        </div>
    );
}
