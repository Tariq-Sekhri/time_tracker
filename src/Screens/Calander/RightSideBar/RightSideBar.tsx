import {ManualProjectFilter} from "../../../hooks/useManualProjectFilters.ts";
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
import { getAppMetadata, setAppMetadata } from "../../../api/appMetadata.ts";
import ResizableSidebar from "./ResizableSidebar";
import ManualTimeBlockView from "./ManualTimeBlockView.tsx";
import AfkBlockView from "./AfkBlockView.tsx";

const RIGHT_SIDEBAR_COLLAPSED_KEY = "time-tracker:right-sidebar-collapsed";

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
    googleCalendars,
    statsCategoryNames,
    statsCategoryFilter,
    statsDeviceUuids,
    isManualTimeInStats,
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
    googleCalendars: GoogleCalendar[],
    statsCategoryNames: Set<string>,
    statsCategoryFilter: string[] | null,
    statsDeviceUuids: string[] | null,
    isManualTimeInStats: ManualProjectFilter,
}) {
    const { date } = useDateStore();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [compactPeriod, setCompactPeriod] = useState<"Week" | "Day" | null>(null);
    useEffect(() => { setCompactPeriod(null); }, [view, selectedDate, selectedEvent]);
    const compactDay = (compactPeriod ?? (view === "Day" ? "Day" : "Week")) === "Day";
    useEffect(()=>{if(selectedEvent?.afkDeviceUuid)setIsCollapsed(false);},[selectedEvent?.afkDeviceUuid,selectedEvent?.start]);

    useEffect(() => {
        getAppMetadata(RIGHT_SIDEBAR_COLLAPSED_KEY)
            .then((raw) => setIsCollapsed(raw === "1"))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setAppMetadata(RIGHT_SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0").catch(() => {});
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

    const compactStatsProps = {
        includeGoogleInStats, googleCalendars, statsCategoryNames, statsCategoryFilter, statsDeviceUuids, isManualTimeInStats,
        compact: true,
        onExpand: () => {
            setSelectedEvent(null); setSelectedEventLogs([]); setSelectedCategory(null);
            setSelectedDate(compactDay ? selectedDate ?? date : null);
            setView(compactDay ? "Day" : "Week"); setIsCollapsed(false);
        },
        onCategoryClick: (category: string) => {
            setSelectedDate(compactDay ? selectedDate ?? date : null);
            setSelectedCategory(category); setView("CategoryFilter"); setIsCollapsed(false);
        },
    };
    const railButton = "flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2";

    return (
        <ResizableSidebar collapsed={isCollapsed}>
            {isCollapsed ? (
                <div className="flex h-full min-h-0 w-full flex-col items-center gap-3 overflow-y-auto overflow-x-hidden nice-scrollbar py-1">
                <button
                    type="button"
                    onClick={() => setIsCollapsed(false)}
                    className={railButton}
                    aria-label="Expand right sidebar"
                    title="Expand right sidebar"
                >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>
                </button>
                <nav aria-label="Statistics period" className="flex flex-col items-center gap-2">
                    <button type="button" aria-label="Week statistics" title="Week statistics" aria-pressed={!compactDay}
                            onClick={() => setCompactPeriod("Week")} className={`${railButton} ${!compactDay ? "bg-white/[0.08] text-gray-100" : ""}`}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4M9 10v11M15 10v11"/></svg>
                    </button>
                    <button type="button" aria-label="Day statistics" title={`Day statistics: ${(selectedDate ?? date).toLocaleDateString()}`} aria-pressed={compactDay}
                            onClick={() => setCompactPeriod("Day")} className={`${railButton} ${compactDay ? "bg-white/[0.08] text-gray-100" : ""}`}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4M9 15h6"/></svg>
                    </button>
                </nav>
                {compactDay
                    ? <DayStatisticsSidebar {...compactStatsProps} selectedDate={selectedDate ?? date} onClose={() => setCompactPeriod("Week")}/>
                    : <StatisticsSidebar {...compactStatsProps} weekDate={date}/>}
                {selectedEvent && <button type="button" aria-label={`Open selected ${view === "CategoryFilter" ? "category" : "event"}: ${selectedEvent.title}`} title={selectedEvent.title}
                    className={`${railButton} mt-auto`} onClick={() => {setView(view === "CategoryFilter" ? "CategoryFilter" : "Event"); setIsCollapsed(false);}}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>
                </button>}
                </div>
            ) : (
                <>
                    {view === "Week" && <StatisticsSidebar
                        weekDate={date}
                        onCategoryClick={(category) => {
                            setSelectedCategory(category);
                            setView("CategoryFilter");
                        }}
                        includeGoogleInStats={includeGoogleInStats}
                        googleCalendars={googleCalendars}
                        statsCategoryNames={statsCategoryNames}
                        statsCategoryFilter={statsCategoryFilter}
                        statsDeviceUuids={statsDeviceUuids}
                        isManualTimeInStats={isManualTimeInStats}
                        trailingToolbar={collapseSidebarButton}
                    />}
                    {view === "Day" && selectedDate && <DayStatisticsSidebar
                        selectedDate={selectedDate}
                        onClose={() => {
                            setView("Week");
                            setSelectedDate(null);
                        }}
                        onCategoryClick={(category) => {
                            setSelectedCategory(category);
                            setView("CategoryFilter");
                        }}
                        includeGoogleInStats={includeGoogleInStats}
                        googleCalendars={googleCalendars}
                        statsCategoryNames={statsCategoryNames}
                        statsCategoryFilter={statsCategoryFilter}
                        statsDeviceUuids={statsDeviceUuids}
                        isManualTimeInStats={isManualTimeInStats}
                        trailingToolbar={collapseSidebarButton}
                    />}
                    {view === "Event" && selectedEvent && (
                        selectedEvent.afkDeviceUuid ? (
                            <AfkBlockView event={selectedEvent} onClose={()=>{setSelectedEvent(null);setView("Week");}} trailingToolbar={collapseSidebarButton}/>
                        ) : selectedEvent.manualTimeBlockId != null ? (
                            <ManualTimeBlockView
                                selectedEvent={selectedEvent}
                                setSelectedEvent={setSelectedEvent}
                                setRightSideBarView={setView}
                                trailingToolbar={collapseSidebarButton}
                            />
                        ) : selectedEvent.googleCalendarEventId ? (
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
                                    <h2 title={selectedCategory} className="truncate text-xl font-bold text-white mb-4">Category: {selectedCategory}</h2>
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
                </>
            )}
        </ResizableSidebar>
    );
}
