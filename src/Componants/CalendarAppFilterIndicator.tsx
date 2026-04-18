import { useCalendarAppFilterStore } from "../stores/calendarAppFilterStore.ts";

export default function CalendarAppFilterIndicator() {
    const queue = useCalendarAppFilterStore((s) => s.queue);
    const activeIndex = useCalendarAppFilterStore((s) => s.activeIndex);
    const clear = useCalendarAppFilterStore((s) => s.clear);
    const next = useCalendarAppFilterStore((s) => s.next);
    const prev = useCalendarAppFilterStore((s) => s.prev);

    if (queue.length === 0) {
        return null;
    }

    const idx = Math.min(Math.max(0, activeIndex), queue.length - 1);
    const name = queue[idx];

    return (
        <div
            className="pointer-events-auto fixed right-50 top-16 z-[300] flex max-w-[min(calc(100vw-2.5rem),22rem)] items-center gap-2 rounded-2xl border border-gray-600 bg-gray-950/95 px-3 py-2 text-sm text-white shadow-xl"
            role="status"
            aria-live="polite"
        >
            {queue.length > 1 && (
                <button
                    type="button"
                    onClick={prev}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-white hover:bg-gray-700"
                    aria-label="Previous app in calendar filter"
                >
                    ◀
                </button>
            )}
            <span className="min-w-0 flex-1 truncate font-medium" title={name}>
                {name}
            </span>
            {queue.length > 1 && (
                <span className="shrink-0 text-xs text-gray-400">
                    {idx + 1}/{queue.length}
                </span>
            )}
            {queue.length > 1 && (
                <button
                    type="button"
                    onClick={next}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-white hover:bg-gray-700"
                    aria-label="Next app in calendar filter"
                >
                    ▶
                </button>
            )}
            <button
                type="button"
                onClick={clear}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                aria-label="Clear calendar app filter"
            >
                ✕
            </button>
        </div>
    );
}
