import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get_categories } from "../../api/Category.ts";
import { get_logs_for_time_block, get_logs_by_category } from "../../api/Log.ts";
import { get_week } from "../../api/week.ts";
import { unwrapResult, getWeekRange } from "../../utils.ts";
import { useState, useMemo, useEffect, useRef } from "react";
import { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import RenderCalendarContent from "./RenderCalenderContent.tsx";
import { getWeekStart, isCurrentWeek } from "./utils.ts";
import { useDateStore } from "../../stores/dateStore.ts";
import { View } from "../../App.tsx";
import CalenderHeader from "./RightSideBar/CalanderHeader.tsx";
import { CalendarEvent, DateClickInfo, EventLogs } from "./types.ts";
import { RightSideBar, SideBarView } from "./RightSideBar/RightSideBar.tsx";
import FullCalendar from '@fullcalendar/react';
import { get_google_calendars, GoogleCalendar } from "../../api/GoogleCalendar.ts";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function Calendar({ setCurrentView }: { setCurrentView: (arg0: View) => void }) {
    const [rightSideBarView, setRightSideBarView] = useState<SideBarView>("Week")
    const { date, setDate } = useDateStore();
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent>(null);
    const [selectedEventLogs, setSelectedEventLogs] = useState<EventLogs>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isLoadingCategory, setIsLoadingCategory] = useState(false);
    const hasInitialized = useRef(false);
    const calenderRef = useRef<any>(null);
    const isUpdatingFromStore = useRef(false);


    const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set());
    const [visibleCalendars, setVisibleCalendars] = useState<Set<number>>(new Set());
    const queryClient = useQueryClient();

    const { data: categories = [] } = useQuery({
        queryKey: ["categories"],
        queryFn: async () => unwrapResult(await get_categories()),
    });

    const { data: googleCalendars = [] } = useQuery({
        queryKey: ["googleCalendars"],
        queryFn: async () => {
            const result = await get_google_calendars();
            return unwrapResult(result);
        },
    });

    const googleCalendarMap = useMemo(() => {
        const map = new Map<number, GoogleCalendar>();
        googleCalendars.forEach(cal => map.set(cal.id, cal));
        return map;
    }, [googleCalendars]);

    useEffect(() => {
        if (categories.length > 0 && !hasInitialized.current) {
            try {
                const saved = localStorage.getItem("visibleCategories");
                const allCategoryNames = categories.map(cat => cat.name);

                if (saved) {
                    const savedArray = JSON.parse(saved) as string[];
                    const savedSet = new Set<string>(savedArray);

                    const mergedSet = new Set<string>();
                    allCategoryNames.forEach(name => {
                        if (savedSet.has(name)) {
                            mergedSet.add(name);
                        } else {
                            const knownCategories = localStorage.getItem("knownCategories");
                            if (knownCategories) {
                                const knownSet = new Set<string>(JSON.parse(knownCategories));
                                if (knownSet.has(name)) {
                                } else {
                                    mergedSet.add(name);
                                }
                            } else {
                                mergedSet.add(name);
                            }
                        }
                    });

                    setVisibleCategories(mergedSet);
                    localStorage.setItem("knownCategories", JSON.stringify(allCategoryNames));
                } else {
                    const allVisible = new Set(allCategoryNames);
                    setVisibleCategories(allVisible);
                    localStorage.setItem("visibleCategories", JSON.stringify([...allVisible]));
                    localStorage.setItem("knownCategories", JSON.stringify(allCategoryNames));
                }
            } catch (e) {
                console.error("Failed to initialize visible categories:", e);
                const allCategoryNames = categories.map(cat => cat.name);
                setVisibleCategories(new Set(allCategoryNames));
            }
            hasInitialized.current = true;
        }
    }, [categories]);

    useEffect(() => {
        if (hasInitialized.current && categories.length > 0) {
            try {
                localStorage.setItem("visibleCategories", JSON.stringify([...visibleCategories]));
                const allCategoryNames = categories.map(cat => cat.name);
                localStorage.setItem("knownCategories", JSON.stringify(allCategoryNames));
            } catch (e) {
                console.error("Failed to save visible categories to localStorage:", e);
            }
        }
    }, [visibleCategories, categories]);

    const hasInitializedCalendars = useRef(false);
    useEffect(() => {
        if (googleCalendars.length > 0 && !hasInitializedCalendars.current) {
            try {
                const saved = localStorage.getItem("visibleCalendars");
                const allCalendarIds = googleCalendars.map(cal => cal.id);

                if (saved) {
                    const savedArray = JSON.parse(saved) as number[];
                    const savedSet = new Set<number>(savedArray);

                    const mergedSet = new Set<number>();
                    allCalendarIds.forEach(id => {
                        if (savedSet.has(id)) {
                            mergedSet.add(id);
                        } else {
                            const knownCalendars = localStorage.getItem("knownCalendars");
                            if (knownCalendars) {
                                const knownSet = new Set<number>(JSON.parse(knownCalendars));
                                if (!knownSet.has(id)) {
                                    mergedSet.add(id);
                                }
                            } else {
                                mergedSet.add(id);
                            }
                        }
                    });

                    setVisibleCalendars(mergedSet);
                    localStorage.setItem("knownCalendars", JSON.stringify(allCalendarIds));
                } else {
                    const allVisible = new Set(allCalendarIds);
                    setVisibleCalendars(allVisible);
                    localStorage.setItem("visibleCalendars", JSON.stringify([...allVisible]));
                    localStorage.setItem("knownCalendars", JSON.stringify(allCalendarIds));
                }
            } catch (e) {
                console.error("Failed to initialize visible calendars:", e);
                const allCalendarIds = googleCalendars.map(cal => cal.id);
                setVisibleCalendars(new Set(allCalendarIds));
            }
            hasInitializedCalendars.current = true;
        }
    }, [googleCalendars]);

    useEffect(() => {
        if (hasInitializedCalendars.current && googleCalendars.length > 0) {
            try {
                localStorage.setItem("visibleCalendars", JSON.stringify([...visibleCalendars]));
                const allCalendarIds = googleCalendars.map(cal => cal.id);
                localStorage.setItem("knownCalendars", JSON.stringify(allCalendarIds));
            } catch (e) {
                console.error("Failed to save visible calendars to localStorage:", e);
            }
        }
    }, [visibleCalendars, googleCalendars]);

    const categoryColorMap = useMemo(() => {
        const map = new Map<string, string>();
        categories.forEach(cat => {
            if (cat.color) {
                map.set(cat.name, cat.color);
            }
        });
        return map;
    }, [categories]);

    useEffect(() => {
        let unlistenFn: (() => void) | null = null;

        const setupFocusListener = async () => {
            try {
                const window = getCurrentWindow();
                
                const unlisten = await window.listen("tauri://focus", () => {
                    queryClient.invalidateQueries({ 
                        predicate: (query) => query.queryKey[0] === "week" 
                    });
                    
                    queryClient.invalidateQueries({ 
                        predicate: (query) => query.queryKey[0] === "googleCalendarEvents" 
                    });
                });
                
                unlistenFn = unlisten;
            } catch (error) {
                console.error("Failed to setup window focus listener:", error);
            }
        };

        setupFocusListener();

        return () => {
            if (unlistenFn) {
                unlistenFn();
            }
        };
    }, [queryClient]);

    const weekStart = getWeekStart(date);
    const { data: weekData } = useQuery({
        queryKey: ["week", weekStart.toISOString()],
        queryFn: async () => unwrapResult(await get_week(weekStart)),
        enabled: !!weekStart && !isNaN(weekStart.getTime()) && !!selectedEvent,
    });

    useEffect(() => {
        if (rightSideBarView === "CategoryFilter") {
            return;
        }

        if (selectedEvent?.googleCalendarEventId) {
            return;
        }

        if (selectedEvent && weekData) {
            const eventExists = weekData.some((block) => {
                const blockStart = new Date(block.startTime * 1000);
                const blockEnd = new Date(block.endTime * 1000);
                const eventStart = selectedEvent.start;
                const eventEnd = selectedEvent.end;

                const startMatch = Math.abs(blockStart.getTime() - eventStart.getTime()) < 1000;
                const endMatch = Math.abs(blockEnd.getTime() - eventEnd.getTime()) < 1000;

                return startMatch && endMatch;
            });

            if (!eventExists) {
                setSelectedEvent(null);
                setSelectedEventLogs([]);
            }
        }
    }, [weekData, selectedEvent, rightSideBarView]);

    useEffect(() => {
        const fetchCategoryLogs = async () => {
            if (selectedCategory && rightSideBarView === "CategoryFilter") {
                setIsLoadingCategory(true);
                let startTime: number;
                let endTime: number;
                let title: string;

                if (selectedDate) {
                    const dayStart = new Date(selectedDate);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(selectedDate);
                    dayEnd.setHours(23, 59, 59, 999);
                    startTime = Math.floor(dayStart.getTime() / 1000);
                    endTime = Math.floor(dayEnd.getTime() / 1000);
                    title = `${selectedCategory} - ${selectedDate.toLocaleDateString()}`;
                } else {
                    const weekRange = getWeekRange(date);
                    startTime = weekRange.week_start;
                    endTime = weekRange.week_end;
                    title = `${selectedCategory} - Week`;
                }

                try {
                    console.log("Fetching category logs:", { category: selectedCategory, startTime, endTime });
                    const result = await get_logs_by_category({
                        category: selectedCategory,
                        start_time: startTime,
                        end_time: endTime,
                    });

                    console.log("Category logs result:", result);

                    if (result.success) {
                        const logMap = new Map<string, { ids: number[], app: string, timestamp: Date, duration: number }>();

                        result.data.forEach(log => {
                            const existing = logMap.get(log.app);
                            if (existing) {
                                existing.ids.push(...log.ids);
                                existing.duration += log.duration;
                                const logTimestamp = new Date(log.timestamp * 1000);
                                if (logTimestamp < existing.timestamp) {
                                    existing.timestamp = logTimestamp;
                                }
                            } else {
                                logMap.set(log.app, {
                                    ids: [...log.ids],
                                    app: log.app,
                                    timestamp: new Date(log.timestamp * 1000),
                                    duration: log.duration,
                                });
                            }
                        });

                        const logs = Array.from(logMap.values()).sort((a, b) => b.duration - a.duration);
                        console.log("Processed logs:", logs.length, "apps for category", selectedCategory);
                        console.log("Logs grouped by app:", logs.map(l => ({ app: l.app, duration: l.duration, ids: l.ids.length })));
                        setSelectedEventLogs(logs);

                        const categoryEvent: CalendarEvent = {
                            title: title,
                            start: new Date(startTime * 1000),
                            end: new Date(endTime * 1000),
                            apps: logs.map(log => ({
                                app: log.app,
                                totalDuration: log.duration,
                            })),
                        };
                        console.log("Created category event:", categoryEvent);
                        setSelectedEvent(categoryEvent);
                    } else {
                        console.error("Failed to fetch category logs:", result.error);
                        const categoryEvent: CalendarEvent = {
                            title: `${selectedCategory} - Error`,
                            start: new Date(startTime * 1000),
                            end: new Date(endTime * 1000),
                            apps: [],
                        };
                        setSelectedEvent(categoryEvent);
                        setSelectedEventLogs([]);
                    }
                } catch (error) {
                    console.error("Error fetching category logs:", error);
                    setSelectedEventLogs([]);
                    setSelectedEvent(null);
                } finally {
                    setIsLoadingCategory(false);
                }
            } else {
                setIsLoadingCategory(false);
            }
        };

        fetchCategoryLogs();
    }, [selectedCategory, rightSideBarView, selectedDate, date]);

    useEffect(() => {
        if (rightSideBarView === "CategoryFilter") {
            return;
        }

        if (selectedEvent && rightSideBarView !== "Event") {
            setRightSideBarView("Event")
        } else if (selectedDate && !selectedEvent && rightSideBarView !== "Day") {
            setRightSideBarView("Day")
        } else if (!selectedDate && !selectedEvent && rightSideBarView === "Week") {
            setSelectedCategory(null);
        } else if (!selectedDate && !selectedEvent && rightSideBarView !== "Week") {
            setRightSideBarView("Week")
        }
    }, [selectedEvent, selectedDate, rightSideBarView])

    const handleEventClick = async (clickInfo: EventClickArg) => {
        if (clickInfo.event.start && clickInfo.event.end) {
            const eventType = clickInfo.event.extendedProps?.type as string | undefined;

            if (eventType === "google_calendar") {
                const event = {
                    title: clickInfo.event.title,
                    start: clickInfo.event.start,
                    end: clickInfo.event.end,
                    apps: [],
                    googleCalendarEventId: clickInfo.event.extendedProps?.eventId as string | undefined,
                    googleCalendarId: clickInfo.event.extendedProps?.calendarId as number | undefined,
                    description: clickInfo.event.extendedProps?.description as string | undefined,
                    location: clickInfo.event.extendedProps?.location as string | undefined,
                };
                setSelectedEvent(event);
                setSelectedDate(null);
                setSelectedEventLogs([]);
                setRightSideBarView("Event");
            } else {
                const event = {
                    title: clickInfo.event.title,
                    start: clickInfo.event.start,
                    end: clickInfo.event.end,
                    apps: (clickInfo.event.extendedProps?.apps || []) as { app: string; totalDuration: number }[],
                };
                setSelectedEvent(event);
                setSelectedDate(null); // Clear date selection when event is selected

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
                        ids: log.ids,
                        app: log.app,
                        timestamp: new Date(log.timestamp * 1000), // Convert seconds to milliseconds
                        duration: log.duration,
                    }));
                    logs.sort((a, b) => b.duration - a.duration);
                    setSelectedEventLogs(logs);
                } else {
                    setSelectedEventLogs([]);
                }
            }
        }
    };

    const handleCalendarClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const isEventClick = target.closest('.fc-event') !== null;
        const isHeaderClick = target.closest('.fc-col-header-cell') !== null;
        if (!isEventClick && !isHeaderClick) {
            setRightSideBarView("Week");
            setSelectedEvent(null);
            setSelectedEventLogs([]);
            setSelectedDate(null);
            setSelectedCategory(null);
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

    const toggleCalendar = (calendarId: number) => {
        setVisibleCalendars(prev => {
            const newSet = new Set(prev);
            if (newSet.has(calendarId)) {
                newSet.delete(calendarId);
            } else {
                newSet.add(calendarId);
            }
            return newSet;
        });
    };

    const checkAllCategories = () => {
        const allCategoryNames = categories.map(cat => cat.name);
        setVisibleCategories(new Set(allCategoryNames));
    };

    const uncheckAllCategories = () => {
        setVisibleCategories(new Set<string>());
    };


    useEffect(() => {
        const calendarApi = calenderRef.current?.getApi();
        if (calendarApi && !isUpdatingFromStore.current) {
            const calendarDate = calendarApi.getDate();
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);

            const calendarDateStr = calendarDate.toISOString().split('T')[0];
            const targetDateStr = targetDate.toISOString().split('T')[0];

            if (calendarDateStr !== targetDateStr) {
                isUpdatingFromStore.current = true;
                calendarApi.gotoDate(targetDateStr);
                setTimeout(() => {
                    isUpdatingFromStore.current = false;
                }, 100);
            }
        }
    }, [date]);

    const handleDatesSet = (dates: DatesSetArg) => {
        if (isUpdatingFromStore.current) {
            return;
        }

        if (dates.start) {
            const calendarDate = new Date(dates.start);
            const storeDate = new Date(date);

            calendarDate.setHours(0, 0, 0, 0);
            storeDate.setHours(0, 0, 0, 0);

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

    useEffect(() => {
        const handleFocus = () => {
            queryClient.invalidateQueries({ queryKey: ["week"] });
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            queryClient.invalidateQueries({ queryKey: ["week_statistics"] });
            queryClient.invalidateQueries({ queryKey: ["day_statistics"] });
            queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [queryClient]);

    const goToPrevWeek = () => {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() - 7);
        setDate(newDate);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    const goToNextWeek = () => {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() + 7);
        setDate(newDate);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    const goToToday = () => {
        setDate(new Date());
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    const headerWeekStart = getWeekStart(date);
    const weekEnd = new Date(headerWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const headerTitle = `${headerWeekStart.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;


    return (
        <div className="flex flex-col h-full w-full">
            <CalenderHeader headerTitle={headerTitle} onClick={goToPrevWeek} d={date} onClick1={goToNextWeek}
                onClick2={goToToday} />

            <div className="flex flex-1 overflow-hidden min-h-0">
                <div className="flex-1 overflow-hidden min-h-0">
                    <div className="h-full p-4 flex flex-col" onClick={handleCalendarClick}>
                        <RenderCalendarContent
                            ref={calenderRef}
                            date={date}
                            categoryColorMap={categoryColorMap}
                            visibleCategories={visibleCategories}
                            categories={categories}
                            toggleCategory={toggleCategory}
                            checkAllCategories={checkAllCategories}
                            uncheckAllCategories={uncheckAllCategories}
                            handleEventClick={handleEventClick}
                            onDatesSet={handleDatesSet}
                            googleCalendarMap={googleCalendarMap}
                            googleCalendars={googleCalendars}
                            visibleCalendars={visibleCalendars}
                            toggleCalendar={toggleCalendar}
                        />
                    </div>
                </div>
                <RightSideBar selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent}
                    setSelectedEventLogs={setSelectedEventLogs} selectedEventLogs={selectedEventLogs}
                    view={rightSideBarView} setView={setRightSideBarView} selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate} setCurrentView={setCurrentView}
                    selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
                    isLoadingCategory={isLoadingCategory} />
            </div>


        </div>
    );
}
