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

    // Initialize visible categories when categories are loaded
    useEffect(() => {
        if (categories.length > 0 && !hasInitialized.current) {
            try {
                const saved = localStorage.getItem("visibleCategories");
                const allCategoryNames = categories.map(cat => cat.name);

                if (saved) {
                    const savedArray = JSON.parse(saved) as string[];
                    const savedSet = new Set<string>(savedArray);

                    // Use saved preferences: categories in saved array are visible
                    // New categories (not in saved) default to visible
                    const mergedSet = new Set<string>();
                    allCategoryNames.forEach(name => {
                        if (savedSet.has(name)) {
                            // Was saved as visible
                            mergedSet.add(name);
                        } else {
                            // Not in saved - could be new category or was hidden
                            // Check if we have any saved data at all - if yes, this was likely hidden
                            // If it's truly new, we'll add it to visible on next save
                            // For now: if saved data exists, assume missing = hidden
                            // But we need to handle new categories differently
                            // Simple approach: if saved exists, only show saved ones; new ones default visible
                            // Actually, let's be smarter: track all known categories
                            const knownCategories = localStorage.getItem("knownCategories");
                            if (knownCategories) {
                                const knownSet = new Set<string>(JSON.parse(knownCategories));
                                if (knownSet.has(name)) {
                                    // Was known but not visible = hidden, keep hidden
                                    // Don't add to mergedSet
                                } else {
                                    // New category - default to visible
                                    mergedSet.add(name);
                                }
                            } else {
                                // No known categories - this is first run, all visible
                                mergedSet.add(name);
                            }
                        }
                    });

                    setVisibleCategories(mergedSet);
                    // Update known categories
                    localStorage.setItem("knownCategories", JSON.stringify(allCategoryNames));
                } else {
                    // No saved preferences - all categories visible by default
                    const allVisible = new Set(allCategoryNames);
                    setVisibleCategories(allVisible);
                    localStorage.setItem("visibleCategories", JSON.stringify([...allVisible]));
                    localStorage.setItem("knownCategories", JSON.stringify(allCategoryNames));
                }
            } catch (e) {
                console.error("Failed to initialize visible categories:", e);
                // Fallback to all visible
                const allCategoryNames = categories.map(cat => cat.name);
                setVisibleCategories(new Set(allCategoryNames));
            }
            hasInitialized.current = true;
        }
    }, [categories]);

    // Save visible categories to localStorage whenever they change
    useEffect(() => {
        if (hasInitialized.current && categories.length > 0) {
            try {
                localStorage.setItem("visibleCategories", JSON.stringify([...visibleCategories]));
                // Also update known categories
                const allCategoryNames = categories.map(cat => cat.name);
                localStorage.setItem("knownCategories", JSON.stringify(allCategoryNames));
            } catch (e) {
                console.error("Failed to save visible categories to localStorage:", e);
            }
        }
    }, [visibleCategories, categories]);

    // Initialize visible calendars when calendars are loaded
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
                                    // New calendar - default to visible
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
                    // No saved preferences - all calendars visible by default
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

    // Save visible calendars to localStorage whenever they change
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

    // Listen for window focus events to refresh calendar data
    useEffect(() => {
        let unlistenFn: (() => void) | null = null;

        const setupFocusListener = async () => {
            try {
                const window = getCurrentWindow();
                
                // Listen for window focus events
                const unlisten = await window.listen("tauri://focus", () => {
                    // Window gained focus - refresh all calendar data
                    // Invalidate all week queries (will refetch automatically)
                    queryClient.invalidateQueries({ 
                        predicate: (query) => query.queryKey[0] === "week" 
                    });
                    
                    // Invalidate Google Calendar events queries
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

    // Get week data to check if selectedEvent still exists
    const weekStart = getWeekStart(date);
    const { data: weekData } = useQuery({
        queryKey: ["week", weekStart.toISOString()],
        queryFn: async () => unwrapResult(await get_week(weekStart)),
        enabled: !!weekStart && !isNaN(weekStart.getTime()) && !!selectedEvent,
    });

    // Check if selectedEvent still exists in the week data after refresh
    // Skip this check for category-filtered events (they're synthetic and won't be in weekData)
    // Skip this check for Google Calendar events (they're not in weekData, only in Google Calendar)
    useEffect(() => {
        // Don't check if we're in CategoryFilter mode - those events are synthetic
        if (rightSideBarView === "CategoryFilter") {
            return;
        }

        // Don't check Google Calendar events - they're not in weekData
        if (selectedEvent?.googleCalendarEventId) {
            return;
        }

        if (selectedEvent && weekData) {
            // Check if the event still exists by matching start/end times
            // Use lenient matching: only check time range, not exact app matching
            // This prevents the sidebar from closing when apps are deleted
            const eventExists = weekData.some((block) => {
                const blockStart = new Date(block.startTime * 1000);
                const blockEnd = new Date(block.endTime * 1000);
                const eventStart = selectedEvent.start;
                const eventEnd = selectedEvent.end;

                // Check if times match (within 1 second tolerance)
                const startMatch = Math.abs(blockStart.getTime() - eventStart.getTime()) < 1000;
                const endMatch = Math.abs(blockEnd.getTime() - eventEnd.getTime()) < 1000;

                // If time range matches, consider it the same event
                // Don't require exact app matching to allow for deletions/updates
                return startMatch && endMatch;
            });

            // If event doesn't exist anymore (time range doesn't match), reset it
            if (!eventExists) {
                setSelectedEvent(null);
                setSelectedEventLogs([]);
            }
        }
    }, [weekData, selectedEvent, rightSideBarView]);

    // Handle category click - fetch logs filtered by category
    useEffect(() => {
        const fetchCategoryLogs = async () => {
            if (selectedCategory && rightSideBarView === "CategoryFilter") {
                setIsLoadingCategory(true);
                let startTime: number;
                let endTime: number;
                let title: string;

                if (selectedDate) {
                    // Day view
                    const dayStart = new Date(selectedDate);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(selectedDate);
                    dayEnd.setHours(23, 59, 59, 999);
                    startTime = Math.floor(dayStart.getTime() / 1000);
                    endTime = Math.floor(dayEnd.getTime() / 1000);
                    title = `${selectedCategory} - ${selectedDate.toLocaleDateString()}`;
                } else {
                    // Week view
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
                        // The backend already groups logs by app via merge_logs_in_time_block
                        // But we'll group again on the frontend as a safety measure to ensure no duplicates
                        const logMap = new Map<string, { ids: number[], app: string, timestamp: Date, duration: number }>();

                        result.data.forEach(log => {
                            const existing = logMap.get(log.app);
                            if (existing) {
                                // Merge: combine IDs and sum durations
                                existing.ids.push(...log.ids);
                                existing.duration += log.duration;
                                // Keep earliest timestamp
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

                        // Convert map to array and sort by duration
                        const logs = Array.from(logMap.values()).sort((a, b) => b.duration - a.duration);
                        console.log("Processed logs:", logs.length, "apps for category", selectedCategory);
                        console.log("Logs grouped by app:", logs.map(l => ({ app: l.app, duration: l.duration, ids: l.ids.length })));
                        setSelectedEventLogs(logs);

                        // Always create event to show the category name, even if no logs
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
                        // Still create an event to show the category name even on error
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

    // Only auto-update view if we're not already on the correct view
    // This prevents flicker when clicking calendar background (which sets view directly)
    useEffect(() => {
        // Don't interfere with CategoryFilter mode
        if (rightSideBarView === "CategoryFilter") {
            return;
        }

        if (selectedEvent && rightSideBarView !== "Event") {
            setRightSideBarView("Event")
        } else if (selectedDate && !selectedEvent && rightSideBarView !== "Day") {
            setRightSideBarView("Day")
        } else if (!selectedDate && !selectedEvent && rightSideBarView === "Week") {
            // Reset category when going back to Week view
            setSelectedCategory(null);
        } else if (!selectedDate && !selectedEvent && rightSideBarView !== "Week") {
            setRightSideBarView("Week")
        }
    }, [selectedEvent, selectedDate, rightSideBarView])

    const handleEventClick = async (clickInfo: EventClickArg) => {
        if (clickInfo.event.start && clickInfo.event.end) {
            const eventType = clickInfo.event.extendedProps?.type as string | undefined;

            if (eventType === "google_calendar") {
                // Handle Google Calendar event - just show it, no editing since we don't store events
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
                // Set view to Event to show Google Calendar event details
                setRightSideBarView("Event");
            } else {
                // Handle time block event
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
                        ids: log.ids,
                        app: log.app,
                        timestamp: new Date(log.timestamp * 1000), // Convert seconds to milliseconds
                        duration: log.duration,
                    }));
                    // Sort by duration (longest first) - backend already sorts, but ensure it here too
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
            // Reset everything and set view to Week immediately to avoid flicker
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

    // Refresh calendar data when window comes back into focus
    useEffect(() => {
        const handleFocus = () => {
            // Invalidate all calendar-related queries to trigger refetch
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
        // Allow going forward from any week - only disable button if on current week
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
