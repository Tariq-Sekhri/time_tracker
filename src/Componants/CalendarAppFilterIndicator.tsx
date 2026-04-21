import { useCalendarAppFilterStore } from "../stores/calendarAppFilterStore.ts";

export default function CalendarAppFilterIndicator() {
    const activeApp = useCalendarAppFilterStore((s) => s.activeApp);
    const clear = useCalendarAppFilterStore((s) => s.clear);

    if (!activeApp) {
        return null;
    }

    return (
        <div
            className="pointer-events-auto fixed right-50 top-16 z-[300] flex max-w-[min(calc(100vw-2.5rem),22rem)] items-center gap-2 rounded-2xl border border-gray-600 bg-gray-950/95 px-3 py-2 text-sm text-white shadow-xl"
            role="status"
            aria-live="polite"
        >
            <span className="min-w-0 flex-1 truncate font-medium" title={activeApp}>
                {activeApp}
            </span>
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
