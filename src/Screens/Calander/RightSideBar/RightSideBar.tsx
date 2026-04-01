import StatisticsSidebar from "./StatisticsSidebar.tsx";
import { View } from "../../../App.tsx";
import { useDateStore } from "../../../stores/dateStore.ts";
import AppsInTimeBlock from "./AppsInTimeBlock.tsx";
import { CalendarEvent, EventLogs } from "../types.ts";
import { SelectedEvent } from "./AppsInTimeBlock.tsx";
import DayStatisticsSidebar from "./DayStatisticsSidebar.tsx";
import GoogleCalendarEventView from "./GoogleCalendarEventView.tsx";
import { GoogleCalendar } from "../../../api/GoogleCalendar.ts";
import { useEffect, useState } from "react";
import { useSettingsStore } from "../../../stores/settingsStore.ts";

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
    isLoadingCategory,
    includeGoogleInStats,
    calendarsInStats,
    googleCalendars
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
    includeGoogleInStats: boolean,
    calendarsInStats: Set<number>,
    googleCalendars: GoogleCalendar[]
}) {
    const { date } = useDateStore();
    const { rightSidebarWidth } = useSettingsStore();
    const RIGHT_SIDEBAR_COLLAPSED_KEY = "time-tracker:right-sidebar-collapsed";
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            return localStorage.getItem(RIGHT_SIDEBAR_COLLAPSED_KEY) === "1";
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0");
        } catch {
        }
    }, [isCollapsed]);

    const collapseSidebarButton = (
        <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="shrink-0 h-8 w-8 flex items-center justify-center text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors"
            aria-label="Collapse right sidebar"
        >
            »
        </button>
    );

    if (isCollapsed) {
        return (
            <div className="w-16 h-full min-h-0 overflow-hidden flex-shrink-0 border-l border-gray-700 bg-black p-2 flex flex-col items-center">
                <button
                    type="button"
                    onClick={() => setIsCollapsed(false)}
                    className="shrink-0 px-2 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
                    aria-label="Expand right sidebar"
                >
                    «
                </button>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 overflow-hidden flex-shrink-0" style={{ width: `${rightSidebarWidth}px` }}>
            {view === "Week" && <StatisticsSidebar
                weekDate={date}
                onMoreInfo={() => setCurrentView("detailed")}
                onAppsList={() => setCurrentView("apps")}
                onCategoryClick={(category) => {
                    setSelectedCategory(category);
                    setView("CategoryFilter");
                }}
                includeGoogleInStats={includeGoogleInStats}
                calendarsInStats={calendarsInStats}
                googleCalendars={googleCalendars}
                trailingToolbar={collapseSidebarButton}
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
                includeGoogleInStats={includeGoogleInStats}
                calendarsInStats={calendarsInStats}
                googleCalendars={googleCalendars}
                trailingToolbar={collapseSidebarButton}
            />}
            {view === "Event" && selectedEvent && (
                selectedEvent.googleCalendarEventId ? (
                    <GoogleCalendarEventView
                        selectedEvent={selectedEvent}
                        setSelectedEvent={setSelectedEvent}
                        setRightSideBarView={setView}
                        trailingToolbar={collapseSidebarButton}
                    />
                ) : (
                    <AppsInTimeBlock selectedEvent={selectedEvent as SelectedEvent}
                        setSelectedEventLogs={setSelectedEventLogs}
                        setSelectedEvent={setSelectedEvent} selectedEventLogs={selectedEventLogs}
                        setRightSideBarView={setView}
                        isCategoryFilter={false}
                        trailingToolbar={collapseSidebarButton} />
                )
            )}
            {view === "CategoryFilter" && (
                isLoadingCategory ? (
                    <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                        <div className="flex justify-end shrink-0 mb-4">{collapseSidebarButton}</div>
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
                        isCategoryFilter={true}
                        trailingToolbar={collapseSidebarButton} />
                ) : selectedCategory ? (
                    <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                        <div className="flex justify-end shrink-0 mb-4">{collapseSidebarButton}</div>
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
                    <div className="border-l border-gray-700 bg-black p-6 overflow-y-auto nice-scrollbar flex flex-col h-full min-h-0">
                        <div className="flex justify-end shrink-0 mb-4">{collapseSidebarButton}</div>
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-gray-500">No category selected</div>
                        </div>
                    </div>
                )
            )}
        </div>
    );
}