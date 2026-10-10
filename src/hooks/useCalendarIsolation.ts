import {useState} from "react";

type Isolation = {
    category: number | null;
    device: string | null;
    calendar: number | null;
    project: {id: number | null} | null;
};
const empty: Isolation = {category: null, device: null, calendar: null, project: null};

// Devices and categories are two dimensions of tracked activity. Other sources
// have their own identifiers, so switching to them replaces tracked isolation.
export function useCalendarIsolation() {
    const [state, setState] = useState<Isolation>(empty);
    const tracked = state.category !== null || state.device !== null;
    return {
        ...state,
        active: tracked || state.calendar !== null || state.project !== null,
        showTracked: state.calendar === null && state.project === null,
        showGoogle: !tracked && state.project === null,
        showManual: !tracked && state.calendar === null,
        toggleCategory: (id: number) => setState(s => ({...empty, device: s.device, category: s.category === id ? null : id})),
        toggleDevice: (uuid: string) => setState(s => ({...empty, category: s.category, device: s.device === uuid ? null : uuid})),
        toggleCalendar: (id: number) => setState(s => ({...empty, calendar: s.calendar === id ? null : id})),
        toggleProject: (id: number | null) => setState(s => ({...empty, project: s.project?.id === id ? null : {id}})),
        clearCategory: () => setState(s => ({...s, category: null})),
        clearDevice: () => setState(s => ({...s, device: null})),
        clearCalendar: () => setState(s => ({...s, calendar: null})),
        clearProject: () => setState(s => ({...s, project: null})),
    };
}
export type CalendarIsolation = ReturnType<typeof useCalendarIsolation>;
