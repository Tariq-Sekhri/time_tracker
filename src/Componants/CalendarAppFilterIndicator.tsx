import { useCalendarAppFilterStore } from "../stores/calendarAppFilterStore.ts";

type CalendarAppFilterIndicatorProps = {
    onPrev?: () => void;
    onNext?: () => void;
    prevDisabled?: boolean;
    nextDisabled?: boolean;
};

export default function CalendarAppFilterIndicator({
    onPrev,
    onNext,
    prevDisabled = false,
    nextDisabled = false,
}: CalendarAppFilterIndicatorProps) {
    const activeApp = useCalendarAppFilterStore((s) => s.activeApp);
    const clear = useCalendarAppFilterStore((s) => s.clear);

    if (!activeApp) {
        return null;
    }

    return (
        <div
            className="flex max-w-[min(calc(100vw-2.5rem),22rem)] items-center gap-2 rounded-2xl border border-gray-600 bg-gray-950/95 px-3 py-2 text-sm text-white shadow-xl"
            role="status"
            aria-live="polite"
        >
            <span className="min-w-0 flex-1 truncate font-medium" title={activeApp}>
                {activeApp}
            </span>
            <div className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={onPrev}
                    disabled={prevDisabled}
                    className={`rounded-lg px-2 py-1 text-xs ${prevDisabled ? "text-gray-600 cursor-not-allowed" : "text-gray-300 hover:bg-gray-700 hover:text-white"}`}
                    aria-label="Jump to previous week containing selected app"
                >
                    ‹
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={nextDisabled}
                    className={`rounded-lg px-2 py-1 text-xs ${nextDisabled ? "text-gray-600 cursor-not-allowed" : "text-gray-300 hover:bg-gray-700 hover:text-white"}`}
                    aria-label="Jump to next week containing selected app"
                >
                    ›
                </button>
            </div>
            <button
                type="button"
                onClick={clear}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                aria-label="Clear calendar app filter"
            >
                x
            </button>
        </div>
    );
}
