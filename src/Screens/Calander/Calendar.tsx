import {useQuery, useQueryClient} from "@tanstack/react-query";
import {get_categories} from "../../api/Category.ts";
import {get_logs_for_time_block, get_logs_by_category} from "../../api/Log.ts";
import {get_week} from "../../api/week.ts";
import { adjustInstantToCalendarDayBoundary, getCalendarDayRangeUnix, getWeekRange } from "../../utils.ts";
import {useState, useMemo, useEffect, useRef} from "react";
import {EventClickArg, DatesSetArg} from "@fullcalendar/core";
import RenderCalendarContent from "./RenderCalenderContent.tsx";
import {formatLocalDateYMD, getWeekStart} from "./utils.ts";
import {useDateStore} from "../../stores/dateStore.ts";
import {View} from "../../App.tsx";
import CalenderHeader from "./RightSideBar/CalanderHeader.tsx";
import {CalendarEvent, EventLogs} from "./types.ts";
import {RightSideBar, SideBarView} from "./RightSideBar/RightSideBar.tsx";
import {get_google_calendars, GoogleCalendar} from "../../api/GoogleCalendar.ts";
import {getCachedCalendars, setCachedCalendars} from "../../stores/googleCalendarCache.ts";
import {getCurrentWindow} from "@tauri-apps/api/window";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import {
    loadCalendarViewPrefs,
    saveCalendarViewPrefs,
    type CalendarViewPrefsV1,
} from "../../api/calendarViewPrefs.ts";

export default function Calendar({setCurrentView}: { setCurrentView: (arg0: View) => void }) {
    const [rightSideBarView, setRightSideBarView] = useState<SideBarView>("Week")
    const {date, setDate} = useDateStore();
    const { timeBlockSettings, calendarStartHour } = useSettingsStore();
    const [includeGoogleInStats, setIncludeGoogleInStats] = useState(false);

    const { data: viewPrefs } = useQuery({
        queryKey: ["calendarViewPrefs"],
        queryFn: loadCalendarViewPrefs,
        staleTime: Infinity,
    });
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent>(null);
    const [selectedEventLogs, setSelectedEventLogs] = useState<EventLogs>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isLoadingCategory, setIsLoadingCategory] = useState(false);
    const hasInitialized = useRef(false);
    const calenderRef = useRef<any>(null);
    const isUpdatingFromStore = useRef(false);
    const didAlignInitialWeekToBoundary = useRef(false);


    const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set());
    const [visibleCalendars, setVisibleCalendars] = useState<Set<number>>(new Set());
    const [calendarsInStats, setCalendarsInStats] = useState<Set<number>>(new Set());
    const queryClient = useQueryClient();
    const savePrefsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasInitializedCalendars = useRef(false);
    const hasInitializedStatsCalendars = useRef(false);
    const prevDisplayCalendarsLenRef = useRef<number | null>(null);

    useEffect(() => {
        if (viewPrefs) {
            setIncludeGoogleInStats(viewPrefs.includeGoogleInStats);
        }
    }, [viewPrefs]);

    useEffect(() => {
        if (didAlignInitialWeekToBoundary.current) return;
        didAlignInitialWeekToBoundary.current = true;
        setDate(adjustInstantToCalendarDayBoundary(new Date(), calendarStartHour));
    }, [calendarStartHour, setDate]);

    useEffect(() => {
        const host = document.querySelector(".calendar-fc-host");
        if (!host) return;
        const ae = document.activeElement;
        if (ae instanceof HTMLElement && host.contains(ae)) {
            ae.blur();
        }
        host.querySelectorAll(".fc-event-selected").forEach((el) => {
            el.classList.remove("fc-event-selected");
        });
    }, [visibleCategories]);

    useEffect(() => {
        if (!selectedEvent?.category || selectedEvent.googleCalendarEventId != null) return;
        if (visibleCategories.has(selectedEvent.category)) return;
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setRightSideBarView((v) => (v === "Event" ? "Week" : v));
    }, [visibleCategories, selectedEvent]);

    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });

    const {data: googleCalendars, isError: isGoogleCalendarsError, error: googleCalendarsError} = useQuery({
        queryKey: ["googleCalendars"],
        queryFn: async () => {
            console.log("[GCal Calendar] fetching google calendars from DB");
            const data = await get_google_calendars();
            console.log("[GCal Calendar] got", data.length, "calendars from DB:", data.map(c => ({ id: c.id, name: c.name, google_calendar_id: c.google_calendar_id })));
            return data;
        },
    });

    if (googleCalendarsError) {
        console.error("[GCal Calendar] calendar fetch error:", googleCalendarsError);
    }

    const displayCalendars = googleCalendars ?? (isGoogleCalendarsError ? (getCachedCalendars() ?? []) : []);
    console.log("[GCal Calendar] displayCalendars:", displayCalendars.length, "calendars, isError:", isGoogleCalendarsError, "raw data:", googleCalendars?.length ?? "null");

    useEffect(() => {
        if (googleCalendars && googleCalendars.length >= 0) {
            setCachedCalendars(googleCalendars);
        }
    }, [displayCalendars]);

    const googleCalendarMap = useMemo(() => {
        const map = new Map<number, GoogleCalendar>();
        displayCalendars.forEach(cal => map.set(cal.id, cal));
        return map;
    }, [displayCalendars]);

    useEffect(() => {
        const n = displayCalendars.length;
        const prev = prevDisplayCalendarsLenRef.current;
        if (prev !== null && prev === 0 && n > 0) {
            hasInitializedCalendars.current = false;
            hasInitializedStatsCalendars.current = false;
        }
        prevDisplayCalendarsLenRef.current = n;
    }, [displayCalendars.length]);

    useEffect(() => {
        if (categories.length === 0 || !viewPrefs || hasInitialized.current) return;
        try {
            const savedArray = viewPrefs.visibleCategories;
            const allCategoryNames = categories.map((cat) => cat.name);
            const hasSavedState =
                savedArray.length > 0 || viewPrefs.knownCategories.length > 0;

            if (hasSavedState) {
                const savedSet = new Set<string>(savedArray);
                const knownSet = new Set<string>(viewPrefs.knownCategories);
                const mergedSet = new Set<string>();
                allCategoryNames.forEach((name) => {
                    if (savedSet.has(name)) {
                        mergedSet.add(name);
                    } else if (viewPrefs.knownCategories.length > 0) {
                        if (!knownSet.has(name)) {
                            mergedSet.add(name);
                        }
                    } else {
                        mergedSet.add(name);
                    }
                });
                setVisibleCategories(mergedSet);
            } else {
                const allVisible = new Set(allCategoryNames);
                setVisibleCategories(allVisible);
            }
        } catch (e) {
            console.error("Failed to initialize visible categories:", e);
            const allCategoryNames = categories.map((cat) => cat.name);
            setVisibleCategories(new Set(allCategoryNames));
        }
        hasInitialized.current = true;
    }, [categories, viewPrefs]);

    useEffect(() => {
        if (!viewPrefs) return;
        if (displayCalendars.length === 0) {
            if (!hasInitializedCalendars.current) hasInitializedCalendars.current = true;
            if (!hasInitializedStatsCalendars.current) hasInitializedStatsCalendars.current = true;
            return;
        }
        if (hasInitializedCalendars.current) return;
        try {
            const allCalendarIds = displayCalendars.map((cal) => cal.id);
            const savedArray = viewPrefs.visibleCalendars;
            const hasSavedState =
                savedArray.length > 0 || viewPrefs.knownCalendars.length > 0;

            if (hasSavedState) {
                const savedSet = new Set<number>(savedArray);
                const knownSet = new Set<number>(viewPrefs.knownCalendars);
                const mergedSet = new Set<number>();
                allCalendarIds.forEach((id) => {
                    if (savedSet.has(id)) {
                        mergedSet.add(id);
                    } else if (viewPrefs.knownCalendars.length > 0) {
                        if (!knownSet.has(id)) {
                            mergedSet.add(id);
                        }
                    } else {
                        mergedSet.add(id);
                    }
                });
                setVisibleCalendars(mergedSet);
            } else {
                setVisibleCalendars(new Set(allCalendarIds));
            }
        } catch (e) {
            console.error("[GCal Calendar] Failed to initialize visible calendars:", e);
            const allCalendarIds = displayCalendars.map((cal) => cal.id);
            setVisibleCalendars(new Set(allCalendarIds));
        }
        hasInitializedCalendars.current = true;
    }, [displayCalendars, viewPrefs]);

    useEffect(() => {
        if (!viewPrefs) return;
        if (displayCalendars.length === 0) {
            if (!hasInitializedStatsCalendars.current) hasInitializedStatsCalendars.current = true;
            return;
        }
        if (hasInitializedStatsCalendars.current) return;
        try {
            const allCalendarIds = displayCalendars.map((cal) => cal.id);
            const savedArray = viewPrefs.googleCalendarsInStats;
            const hasSavedState =
                savedArray.length > 0 ||
                viewPrefs.knownGoogleCalendarsInStats.length > 0;

            if (hasSavedState) {
                const savedSet = new Set<number>(savedArray);
                const knownSet = new Set<number>(viewPrefs.knownGoogleCalendarsInStats);
                const mergedSet = new Set<number>();
                allCalendarIds.forEach((id) => {
                    if (savedSet.has(id)) {
                        mergedSet.add(id);
                    } else if (viewPrefs.knownGoogleCalendarsInStats.length > 0) {
                        if (!knownSet.has(id)) {
                            mergedSet.add(id);
                        }
                    } else {
                        mergedSet.add(id);
                    }
                });
                setCalendarsInStats(mergedSet);
            } else {
                let initial = new Set(allCalendarIds);
                const visArr = viewPrefs.visibleCalendars;
                if (visArr.length > 0) {
                    const fromVis = new Set(visArr.filter((id) => allCalendarIds.includes(id)));
                    if (fromVis.size > 0) {
                        initial = fromVis;
                    }
                }
                setCalendarsInStats(initial);
            }
        } catch (e) {
            console.error("Failed to initialize Google calendars in stats:", e);
            const allCalendarIds = displayCalendars.map((cal) => cal.id);
            setCalendarsInStats(new Set(allCalendarIds));
        }
        hasInitializedStatsCalendars.current = true;
    }, [displayCalendars, viewPrefs]);

    useEffect(() => {
        if (!viewPrefs) return;
        if (
            !hasInitialized.current ||
            !hasInitializedCalendars.current ||
            !hasInitializedStatsCalendars.current
        ) {
            return;
        }
        if (savePrefsDebounceRef.current) {
            clearTimeout(savePrefsDebounceRef.current);
        }
        savePrefsDebounceRef.current = setTimeout(() => {
            const payload: CalendarViewPrefsV1 = {
                includeGoogleInStats,
                visibleCategories: [...visibleCategories],
                knownCategories: categories.map((c) => c.name),
                visibleCalendars: [...visibleCalendars],
                knownCalendars: displayCalendars.map((c) => c.id),
                googleCalendarsInStats: [...calendarsInStats],
                knownGoogleCalendarsInStats: displayCalendars.map((c) => c.id),
            };
            saveCalendarViewPrefs(payload).catch((e) => {
                console.error("[Calendar] Failed to save calendar view prefs:", e);
            });
        }, 250);
        return () => {
            if (savePrefsDebounceRef.current) {
                clearTimeout(savePrefsDebounceRef.current);
            }
        };
    }, [
        viewPrefs,
        includeGoogleInStats,
        visibleCategories,
        visibleCalendars,
        calendarsInStats,
        categories,
        displayCalendars,
    ]);

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

    const weekStart = getWeekStart(date, calendarStartHour);
    const {data: weekData} = useQuery({
        queryKey: [
            "week",
            formatLocalDateYMD(weekStart),
            calendarStartHour,
            timeBlockSettings.minLogDuration,
            timeBlockSettings.maxAttachDistance,
            timeBlockSettings.lookaheadWindow,
            timeBlockSettings.minDuration,
        ],
        queryFn: async () => await get_week(weekStart, timeBlockSettings, calendarStartHour),
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
            const eventStartMs = selectedEvent.start.getTime();
            const eventEndMs = selectedEvent.end.getTime();
            const eventExists =
                selectedEvent.timeBlockId != null
                    ? weekData.some((block) => block.id === selectedEvent.timeBlockId)
                    : weekData.some((block) => {
                          const blockStartMs = block.startTime * 1000;
                          const blockEndMs = block.endTime * 1000;
                          return eventStartMs < blockEndMs && blockStartMs < eventEndMs;
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
                    const { day_start, day_end } = getCalendarDayRangeUnix(selectedDate, calendarStartHour);
                    startTime = day_start;
                    endTime = day_end;
                    title = `${selectedCategory} - ${selectedDate.toLocaleDateString()}`;
                } else {
                    const weekRange = getWeekRange(date, calendarStartHour);
                    startTime = weekRange.week_start;
                    endTime = weekRange.week_end;
                    title = `${selectedCategory} - Week`;
                }

                try {
                    console.log("Fetching category logs:", {category: selectedCategory, startTime, endTime});
                    const result = await get_logs_by_category({
                        category: selectedCategory,
                        start_time: startTime,
                        end_time: endTime,
                    });

                    console.log("Category logs result:", result);

                    const logMap = new Map<string, {
                        ids: number[],
                        app: string,
                        timestamp: Date,
                        duration: number
                    }>();

                    result.forEach(log => {
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
                    console.log("Logs grouped by app:", logs.map(l => ({
                        app: l.app,
                        duration: l.duration,
                        ids: l.ids.length
                    })));
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
    }, [selectedCategory, rightSideBarView, selectedDate, date, calendarStartHour]);

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
                const timeBlockId = clickInfo.event.extendedProps?.timeBlockId as number | undefined;
                const category = clickInfo.event.extendedProps?.category as string | undefined;
                const event = {
                    title: clickInfo.event.title,
                    start: clickInfo.event.start,
                    end: clickInfo.event.end,
                    apps: (clickInfo.event.extendedProps?.apps || []) as { app: string; totalDuration: number }[],
                    ...(category != null && category !== "" ? { category } : {}),
                    ...(timeBlockId != null ? { timeBlockId } : {}),
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

                const logs = result.map(log => ({
                    ids: log.ids,
                    app: log.app,
                    timestamp: new Date(log.timestamp * 1000),
                    duration: log.duration,
                }));
                logs.sort((a, b) => b.duration - a.duration);
                setSelectedEventLogs(logs);
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

    const toggleCalendarInStats = (calendarId: number) => {
        setCalendarsInStats((prev) => {
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
            const calendarWeekYmd = formatLocalDateYMD(
                getWeekStart(calendarApi.getDate(), calendarStartHour)
            );
            const storeWeekYmd = formatLocalDateYMD(getWeekStart(date, calendarStartHour));

            if (calendarWeekYmd !== storeWeekYmd) {
                isUpdatingFromStore.current = true;
                calendarApi.gotoDate(storeWeekYmd);
                setTimeout(() => {
                    isUpdatingFromStore.current = false;
                }, 100);
            }
        }
    }, [date, calendarStartHour]);

    const handleDatesSet = (dates: DatesSetArg) => {
        if (isUpdatingFromStore.current) {
            return;
        }

        if (dates.start) {
            const calendarDate = new Date(dates.start);
            const storeDate = new Date(date);

            calendarDate.setHours(0, 0, 0, 0);
            storeDate.setHours(0, 0, 0, 0);

            const calendarWeekStart = getWeekStart(calendarDate, calendarStartHour);
            const storeWeekStart = getWeekStart(storeDate, calendarStartHour);

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
            queryClient.invalidateQueries({queryKey: ["week"]});
            queryClient.invalidateQueries({queryKey: ["categories"]});
            queryClient.invalidateQueries({queryKey: ["week_statistics"]});
            queryClient.invalidateQueries({queryKey: ["day_statistics"]});
            queryClient.invalidateQueries({queryKey: ["googleCalendarEvents"]});
        };

        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [queryClient]);

    const goToPrevWeek = () => {
        const ws = getWeekStart(date, calendarStartHour);
        const newDate = new Date(ws);
        newDate.setDate(newDate.getDate() - 7);
        setDate(newDate);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    const goToNextWeek = () => {
        const ws = getWeekStart(date, calendarStartHour);
        const newDate = new Date(ws);
        newDate.setDate(newDate.getDate() + 7);
        setDate(newDate);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    const goToToday = () => {
        setDate(adjustInstantToCalendarDayBoundary(new Date(), calendarStartHour));
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    const headerWeekStart = getWeekStart(date, calendarStartHour);
    const weekEnd = new Date(headerWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const headerTitle = `${headerWeekStart.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    })} – ${weekEnd.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}`;


    return (
        <div className="flex flex-col flex-1 min-h-0 w-full">
            <CalenderHeader headerTitle={headerTitle} onClick={goToPrevWeek} d={date} onClick1={goToNextWeek}
                            onClick2={goToToday} calendarStartHour={calendarStartHour}/>

            <div className="flex flex-1 overflow-hidden min-h-0">
                <div className="flex-1 overflow-hidden min-h-0">
                    <div className="h-full min-h-0 flex flex-col" onClick={handleCalendarClick}>
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
                            googleCalendars={displayCalendars}
                            visibleCalendars={visibleCalendars}
                            toggleCalendar={toggleCalendar}
                            calendarsInStats={calendarsInStats}
                            toggleCalendarInStats={toggleCalendarInStats}
                            includeGoogleInStats={includeGoogleInStats}
                            setIncludeGoogleInStats={setIncludeGoogleInStats}
                        />
                    </div>
                </div>
                <RightSideBar selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent}
                              setSelectedEventLogs={setSelectedEventLogs} selectedEventLogs={selectedEventLogs}
                              view={rightSideBarView} setView={setRightSideBarView} selectedDate={selectedDate}
                              setSelectedDate={setSelectedDate} setCurrentView={setCurrentView}
                              selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
                              isLoadingCategory={isLoadingCategory}
                              includeGoogleInStats={includeGoogleInStats}
                              calendarsInStats={calendarsInStats}
                              googleCalendars={displayCalendars}
                />
            </div>


        </div>
    );
}
