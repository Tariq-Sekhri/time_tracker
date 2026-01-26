import StatisticsSidebar from "./StatisticsSidebar.tsx";
import { View } from "../../../App.tsx";
import { useDateStore } from "../../../stores/dateStore.ts";
import AppsInTimeBlock from "./AppsInTimeBlock.tsx";
import { CalendarEvent, EventLogs } from "../types.ts";
import { SelectedEvent } from "./AppsInTimeBlock.tsx";
import DayStatisticsSidebar from "./DayStatisticsSidebar.tsx";
import GoogleCalendarEventView from "./GoogleCalendarEventView.tsx";

export type SideBarView = "Week" | "Day" | "Event" | "CategoryFilter"

export function RightSideBar({
    view,
    setView,
    setCurrentView,
    selectedDate,
    setSelectedDate,
    selectedEvent,
    setSelectedEvent,
    selectedEventLogs,
    setSelectedEventLogs,
    selectedCategory,
    setSelectedCategory,
    isLoadingCategory
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
    selectedCategory: string | null,
    setSelectedCategory: (category: string | null) => void,
    isLoadingCategory: boolean,
}) {
    const { date } = useDateStore();
    return (
        <div className={"w-120"}>
            {view === "Week" && <StatisticsSidebar
                weekDate={date}
                onMoreInfo={() => setCurrentView("detailed")}
                onAppsList={() => setCurrentView("apps")}
                onCategoryClick={(category) => {
                    setSelectedCategory(category);
                    setView("CategoryFilter");
                }}
            />}
            {view === "Day" && selectedDate && <DayStatisticsSidebar
                selectedDate={selectedDate}
                onMoreInfo={() => setCurrentView("detailed")}
                onClose={() => {
                    setView("Week");
                    setSelectedDate(null);
                }}
                onCategoryClick={(category) => {
                    setSelectedCategory(category);
                    setView("CategoryFilter");
                }}
            />}
            {view === "Event" && selectedEvent && (
                selectedEvent.googleCalendarEventId ? (
                    <GoogleCalendarEventView
                        selectedEvent={selectedEvent}
                        setSelectedEvent={setSelectedEvent}
                        setRightSideBarView={setView}
                    />
                ) : (
                    <AppsInTimeBlock selectedEvent={selectedEvent as SelectedEvent}
                        setSelectedEventLogs={setSelectedEventLogs}
                        setSelectedEvent={setSelectedEvent} selectedEventLogs={selectedEventLogs}
                        setRightSideBarView={setView}
                        isCategoryFilter={false} />
                )
            )}
            {view === "CategoryFilter" && (
                isLoadingCategory ? (
                    <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-gray-500">Loading category data...</div>
                        </div>
                    </div>
                ) : selectedEvent ? (
                    <AppsInTimeBlock selectedEvent={selectedEvent as SelectedEvent}
                        setSelectedEventLogs={setSelectedEventLogs}
                        setSelectedEvent={(event) => {
                            setSelectedEvent(event);
                            if (!event) {
                                setSelectedCategory(null);
                            }
                        }}
                        selectedEventLogs={selectedEventLogs}
                        setRightSideBarView={(newView) => {
                            setView(newView);
                            if (newView === "Week") {
                                setSelectedCategory(null);
                            }
                        }}
                        isCategoryFilter={true} />
                ) : selectedCategory ? (
                    <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                        <div className="flex-1">
                            <h2 className="text-xl font-bold text-white mb-4">Category: {selectedCategory}</h2>
                            <div className="text-gray-500">No data available for this category in the selected time period.</div>
                            <div className="text-gray-500 text-sm mt-2">Check the browser console for details.</div>
                        </div>
                        <div className="mt-auto pt-4 border-t border-gray-700">
                            <button
                                onClick={() => {
                                    setView("Week");
                                    setSelectedCategory(null);
                                }}
                                className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm"
                            >
                                Back
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto flex flex-col">
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-gray-500">No category selected</div>
                        </div>
                    </div>
                )
            )}
        </div>
    );
}