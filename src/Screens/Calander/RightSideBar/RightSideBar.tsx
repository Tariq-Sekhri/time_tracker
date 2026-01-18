import StatisticsSidebar from "./StatisticsSidebar.tsx";
import { View } from "../../../App.tsx";
import { useDateStore } from "../../../stores/dateStore.ts";
import AppsInTimeBlock from "./AppsInTimeBlock.tsx";
import { CalendarEvent, EventLogs } from "../types.ts";
import { SelectedEvent } from "./AppsInTimeBlock.tsx";
import DayStatisticsSidebar from "./DayStatisticsSidebar.tsx";

export type SideBarView = "Week" | "Day" | "Event"

export function RightSideBar({
    view,
    setView,
    setCurrentView,
    selectedDate,
    setSelectedDate,
    selectedEvent,
    setSelectedEvent,
    selectedEventLogs,
    setSelectedEventLogs
}: {
    view: SideBarView,
    setView: (newView: SideBarView) => void,
    setCurrentView: (newView: View) => void,
    selectedDate: Date | null,
    setSelectedDate: (date: Date | null) => void,
    selectedEvent: CalendarEvent,
    setSelectedEvent: (newEvent: CalendarEvent) => void,
    selectedEventLogs: EventLogs,
    setSelectedEventLogs: (newLogs: EventLogs) => void,
}) {
    const { date } = useDateStore();
    return (
        <div>
            {view === "Week" && <StatisticsSidebar
                weekDate={date}
                onMoreInfo={() => setCurrentView("detailed")}
                onAppsList={() => setCurrentView("apps")}
            />}
            {view === "Day" && selectedDate && <DayStatisticsSidebar
                selectedDate={selectedDate}
                onMoreInfo={() => setCurrentView("detailed")}
                onClose={() => {
                    setView("Week");
                    setSelectedDate(null);
                }}
            />}
            {view === "Event" && selectedEvent &&
                <AppsInTimeBlock selectedEvent={selectedEvent as SelectedEvent}
                    setSelectedEventLogs={setSelectedEventLogs}
                    setSelectedEvent={setSelectedEvent} selectedEventLogs={selectedEventLogs}
                    setRightSideBarView={setView} />}
        </div>
    );
}