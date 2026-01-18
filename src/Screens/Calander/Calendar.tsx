import {useQuery} from "@tanstack/react-query";
import {get_categories} from "../../api/Category.ts";
import {get_logs_for_time_block} from "../../api/Log.ts";
import {unwrapResult} from "../../utils.ts";
import {useState, useMemo, useEffect, useRef} from "react";
import {EventClickArg, DatesSetArg} from "@fullcalendar/core";
import RenderCalendarContent from "./RenderCalenderContent.tsx";
import {getWeekStart, isCurrentWeek} from "./utils.ts";
import {useDateStore} from "../../stores/dateStore.ts";
import {View} from "../../App.tsx";
import CalenderHeader from "./RightSideBar/CalanderHeader.tsx";
import {CalendarEvent, DateClickInfo, EventLogs} from "./types.ts";
import {RightSideBar, SideBarView} from "./RightSideBar/RightSideBar.tsx";
import FullCalendar from '@fullcalendar/react';

export default function Calendar({setCurrentView}: { setCurrentView: (arg0: View) => void }) {
    const [rightSideBarView, setRightSideBarView] = useState<SideBarView>("Week")
    const {date, setDate} = useDateStore();
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent>(null);
    const [selectedEventLogs, setSelectedEventLogs] = useState<EventLogs>([]);
    const hasInitialized = useRef(false);
    const calenderRef = useRef<any>(null);
    const isUpdatingFromStore = useRef(false);


    const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set());

    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: async () => unwrapResult(await get_categories()),
    });


    useEffect(() => {
        if (categories.length > 0 && !hasInitialized.current) {
            const allCategoryNames = categories.map(cat => cat.name);
            setVisibleCategories(new Set(allCategoryNames));
            hasInitialized.current = true;
        }
    }, [categories]);
    const categoryColorMap = useMemo(() => {
        const map = new Map<string, string>();
        categories.forEach(cat => {
            if (cat.color) {
                map.set(cat.name, cat.color);
            }
        });
        return map;
    }, [categories]);

    // Only auto-update view if we're not already on the correct view
    // This prevents flicker when clicking calendar background (which sets view directly)
    useEffect(() => {
        if (selectedEvent && rightSideBarView !== "Event") {
            setRightSideBarView("Event")
        } else if (selectedDate && !selectedEvent && rightSideBarView !== "Day") {
            setRightSideBarView("Day")
        } else if (!selectedDate && !selectedEvent && rightSideBarView !== "Week") {
            setRightSideBarView("Week")
        }
    }, [selectedEvent, selectedDate, rightSideBarView])

    const handleEventClick = async (clickInfo: EventClickArg) => {
        if (clickInfo.event.start && clickInfo.event.end) {
            const event = {
                title: clickInfo.event.title,
                start: clickInfo.event.start,
                end: clickInfo.event.end,
                apps: (clickInfo.event.extendedProps?.apps || []) as { app: string; totalDuration: number }[],
            };
            setSelectedEvent(event);
            setSelectedDate(null); // Clear date selection when event is selected

            // Fetch and sort logs by duration
            const startTime = Math.floor(event.start.getTime() / 1000);
            const endTime = Math.floor(event.end.getTime() / 1000);
            const appNames = event.apps.map(a => a.app);

            const result = await get_logs_for_time_block({
                app_names: appNames,
                start_time: startTime,
                end_time: endTime,
            });

            if (result.success) {
                const logs = result.data.map(log => ({
                    app: log.app,
                    timestamp: new Date(Number(log.timestamp) * 1000),
                    duration: log.duration,
                }));
                // Sort by duration (longest first) - backend already sorts, but ensure it here too
                logs.sort((a, b) => b.duration - a.duration);
                setSelectedEventLogs(logs);
            } else {
                setSelectedEventLogs([]);
            }
        }
    };

    const handleCalendarClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const isEventClick = target.closest('.fc-event') !== null;
        const isHeaderClick = target.closest('.fc-col-header-cell') !== null;
        if (!isEventClick && !isHeaderClick) {
            // Reset everything and set view to Week immediately to avoid flicker
            setRightSideBarView("Week");
            setSelectedEvent(null);
            setSelectedEventLogs([]);
            setSelectedDate(null);
        }
    };


    const toggleCategory = (categoryName: string) => {
        setVisibleCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryName)) {
                newSet.delete(categoryName);
            } else {
                newSet.add(categoryName);
            }
            return newSet;
        });
    };


    // Sync calendar with date store
    useEffect(() => {
        const calendarApi = calenderRef.current?.getApi();
        if (calendarApi && !isUpdatingFromStore.current) {
            const calendarDate = calendarApi.getDate();
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);

            // Only update if dates are different (avoid infinite loops)
            const calendarDateStr = calendarDate.toISOString().split('T')[0];
            const targetDateStr = targetDate.toISOString().split('T')[0];

            if (calendarDateStr !== targetDateStr) {
                isUpdatingFromStore.current = true;
                calendarApi.gotoDate(targetDateStr);
                // Reset flag after a short delay to allow calendar to update
                setTimeout(() => {
                    isUpdatingFromStore.current = false;
                }, 100);
            }
        }
    }, [date]);

    // Handle calendar date changes (from FullCalendar's datesSet callback)
    const handleDatesSet = (dates: DatesSetArg) => {
        // Don't update if we're in the middle of updating from store
        if (isUpdatingFromStore.current) {
            return;
        }

        if (dates.start) {
            const calendarDate = new Date(dates.start);
            const storeDate = new Date(date);

            // Normalize both to start of day for comparison
            calendarDate.setHours(0, 0, 0, 0);
            storeDate.setHours(0, 0, 0, 0);

            // Only update if different to avoid loops
            const calendarWeekStart = getWeekStart(calendarDate);
            const storeWeekStart = getWeekStart(storeDate);

            if (calendarWeekStart.getTime() !== storeWeekStart.getTime()) {
                setDate(calendarWeekStart);
            }
        }
        const handleHeaderClick = (e: Event) => {
            const target = e.target as HTMLElement;
            const headerCell = target.closest(".fc-col-header-cell");
            if (headerCell) {
                const dateStr = headerCell.getAttribute("data-date");
                if (dateStr) {
                    const clickedDate = new Date(dateStr + "T00:00:00");
                    setSelectedDate(clickedDate);
                    setSelectedEvent(null);
                    setSelectedEventLogs([]);
                    setRightSideBarView("Day");
                }
            }
        };

        const headerCells = document.querySelectorAll(".fc-col-header-cell");
        headerCells.forEach((cell) => {
            (cell as HTMLElement).style.cursor = "pointer";
            cell.addEventListener("click", handleHeaderClick);
        });

        return () => {
            headerCells.forEach((cell) => {
                cell.removeEventListener("click", handleHeaderClick);
            });
        };

    };

    useEffect(() => {
        const handleHeaderClick = (e: Event) => {
            const target = e.target as HTMLElement;
            const headerCell = target.closest(".fc-col-header-cell");
            if (headerCell) {
                const dateStr = headerCell.getAttribute("data-date");
                if (dateStr) {
                    const clickedDate = new Date(dateStr + "T00:00:00");
                    setSelectedDate(clickedDate);
                    setSelectedEvent(null);
                    setSelectedEventLogs([]);
                    setRightSideBarView("Day");
                }
            }
        };

        const headerCells = document.querySelectorAll(".fc-col-header-cell");
        headerCells.forEach((cell) => {
            (cell as HTMLElement).style.cursor = "pointer";
            cell.addEventListener("click", handleHeaderClick);
        });

        return () => {
            headerCells.forEach((cell) => {
                cell.removeEventListener("click", handleHeaderClick);
            });
        };
    }, [date]);


    const goToPrevWeek = () => {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() - 7);
        setDate(newDate);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
    };

    const goToNextWeek = () => {
        // Allow going forward from any week - only disable button if on current week
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() + 7);
        setDate(newDate);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
    };

    const goToToday = () => {
        setDate(new Date());
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
    };

    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const headerTitle = `${weekStart.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    })} – ${weekEnd.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}`;


    return (
        <div className="flex flex-col h-full w-full">
            <CalenderHeader headerTitle={headerTitle} onClick={goToPrevWeek} d={date} onClick1={goToNextWeek}
                            onClick2={goToToday}/>

            <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto p-4" onClick={handleCalendarClick}>
                        <RenderCalendarContent
                            ref={calenderRef}
                            date={date}
                            categoryColorMap={categoryColorMap}
                            visibleCategories={visibleCategories}
                            categories={categories}
                            toggleCategory={toggleCategory}
                            handleEventClick={handleEventClick}
                            onDatesSet={handleDatesSet}
                        />
                    </div>
                </div>
                <RightSideBar selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent}
                              setSelectedEventLogs={setSelectedEventLogs} selectedEventLogs={selectedEventLogs}
                              view={rightSideBarView} setView={setRightSideBarView} selectedDate={selectedDate}
                              setSelectedDate={setSelectedDate} setCurrentView={setCurrentView}/>
            </div>


        </div>
    );
}
