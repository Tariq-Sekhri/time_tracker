import { create } from "zustand";

export type CalendarAppFilterState = {
    activeApp: string | null;
    selectApp: (name: string) => void;
    clear: () => void;
};

export const useCalendarAppFilterStore = create<CalendarAppFilterState>((set) => ({
    activeApp: null,
    selectApp: (name) =>
        set((s) => {
            if (s.activeApp === name) {
                return { activeApp: null };
            }
            return { activeApp: name };
        }),
    clear: () => set({ activeApp: null }),
}));

export function useCalendarAppFilterActive(): string | null {
    return useCalendarAppFilterStore((s) => s.activeApp);
}
