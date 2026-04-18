import { create } from "zustand";

export type CalendarAppFilterState = {
    queue: string[];
    activeIndex: number;
    selectApp: (name: string) => void;
    clear: () => void;
    next: () => void;
    prev: () => void;
};

export const useCalendarAppFilterStore = create<CalendarAppFilterState>((set) => ({
    queue: [],
    activeIndex: 0,
    selectApp: (name) =>
        set((s) => {
            const idx = s.queue.indexOf(name);
            if (idx >= 0) {
                return { queue: s.queue, activeIndex: idx };
            }
            const queue = [...s.queue, name];
            return { queue, activeIndex: queue.length - 1 };
        }),
    clear: () => set({ queue: [], activeIndex: 0 }),
    next: () =>
        set((s) => {
            if (s.queue.length <= 1) {
                return s;
            }
            return { ...s, activeIndex: (s.activeIndex + 1) % s.queue.length };
        }),
    prev: () =>
        set((s) => {
            if (s.queue.length <= 1) {
                return s;
            }
            return { ...s, activeIndex: (s.activeIndex - 1 + s.queue.length) % s.queue.length };
        }),
}));

export function useCalendarAppFilterActive(): string | null {
    return useCalendarAppFilterStore((s) => {
        if (s.queue.length === 0) {
            return null;
        }
        const i = Math.min(Math.max(0, s.activeIndex), s.queue.length - 1);
        return s.queue[i] ?? null;
    });
}
