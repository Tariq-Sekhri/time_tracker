import {create} from "zustand";

export const useRegexNavigation = create<{
    targetId: number | null;
    openRule: (id: number) => void;
    clear: () => void;
}>((set) => ({targetId: null, openRule: (id) => set({targetId: id}), clear: () => set({targetId: null})}));
