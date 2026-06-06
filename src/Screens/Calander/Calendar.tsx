import {useQuery, useQueryClient} from "@tanstack/react-query";
import {get_categories} from "../../api/Category.ts";
import {get_logs_for_time_block, get_logs_by_category, get_log_by_id} from "../../api/Log.ts";
import {get_week, get_week_for_app_filter} from "../../api/week.ts";
import {adjustInstantToCalendarDayBoundary, getCalendarDayRangeUnix, getWeekRange} from "../../utils.ts";
import {useState, useMemo, useEffect, useRef, useCallback} from "react";
import {EventClickArg, DatesSetArg} from "@fullcalendar/core";
import RenderCalendarContent from "./RenderCalenderContent.tsx";
import {formatLocalDateYMD, getWeekStart} from "./utils.ts";
import {useDateStore} from "../../stores/dateStore.ts";
import {View} from "../../App.tsx";
import CalenderHeader from "./RightSideBar/CalanderHeader.tsx";
import {CalendarEvent, EventLogs} from "./types.ts";
import {RightSideBar, SideBarView} from "./RightSideBar/RightSideBar.tsx";
import {get_google_calendars, GoogleCalendar, update_google_calendar} from "../../api/GoogleCalendar.ts";
import {getCachedCalendars, setCachedCalendars} from "../../stores/googleCalendarCache.ts";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {useCalendarAppFilterActive} from "../../stores/calendarAppFilterStore.ts";
import {toErrorString} from "../../types/common.ts";
import {useAppCategorizeMenu} from "../../hooks/useAppCategorizeMenu.tsx";
import {useFilterCategories} from "../../Componants/FilterCategories.tsx";
import {useBackendSettings} from "../../hooks/useBackendSettings.ts";

export default function Calendar({setCurrentView}: { setCurrentView: (arg0: View) => void }) {
    const [rightSideBarView, setRightSideBarView] = useState<SideBarView>("Week")
    const {date, setDate} = useDateStore();
    const {calendarStartHour, timeBlockSettings} = useBackendSettings();
    const calendarAppFilterActive = useCalendarAppFilterActive();
    const [appFilterPrevWeek, setAppFilterPrevWeek] = useState<Date | null>(null);
    const [appFilterNextWeek, setAppFilterNextWeek] = useState<Date | null>(null);
    const [isResolvingAppFilterWeeks, setIsResolvingAppFilterWeeks] = useState(false);

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent>(null);
    const [selectedEventLogs, setSelectedEventLogs] = useState<EventLogs>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isLoadingCategory, setIsLoadingCategory] = useState(false);
    const calenderRef = useRef<any>(null);
    const isUpdatingFromStore = useRef(false);
    const didAlignInitialWeekToBoundary = useRef(false);


    const {openFromContextMenuMany, categorizeLayers} = useAppCategorizeMenu({
        extraInvalidateQueryKeys: [["logsForAppCalendar"]],
    });
    const queryClient = useQueryClient();

    const {data: categories = []} = useQuery({
        queryKey: ["categories"],
        queryFn: get_categories,
    });

    const {
        visibleCategoryNames,
        toggleVisibleCategory,
        checkAllCategories,
        uncheckAllCategories,
    } = useFilterCategories(categories, "calendar_enabled");

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
    }, [visibleCategoryNames]);

    useEffect(() => {
        if (!selectedEvent?.category || selectedEvent.googleCalendarEventId != null) return;
        if (visibleCategoryNames.has(selectedEvent.category)) return;
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setRightSideBarView((v) => (v === "Event" ? "Week" : v));
    }, [visibleCategoryNames, selectedEvent]);

    const {data: googleCalendars, isError: isGoogleCalendarsError, error: googleCalendarsError} = useQuery({
        queryKey: ["googleCalendars"],
        queryFn: () => get_google_calendars(),
    });

    if (googleCalendarsError) {
        console.error("[GCal Calendar] calendar fetch error:", googleCalendarsError);
    }

    const displayCalendars = googleCalendars ?? (isGoogleCalendarsError ? (getCachedCalendars() ?? []) : []);

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
    const weekDataQueryEnabled =
        !!weekStart && !isNaN(weekStart.getTime()) && !!selectedEvent;
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
        queryFn: async () => {
            try {
                const rows = await get_week(weekStart);
                return rows;
            } catch (e) {
                console.error("[Week Calendar.tsx] queryFn threw:", e);
                console.error("[Week Calendar.tsx] toErrorString:", toErrorString(e));
                throw e;
            }
        },
        enabled: weekDataQueryEnabled,
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
                    const {day_start, day_end} = getCalendarDayRangeUnix(selectedDate, calendarStartHour);
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
                    const result = await get_logs_by_category({
                        category: selectedCategory,
                        start_time: startTime,
                        end_time: endTime,
                        min_log_duration: timeBlockSettings.minLogDuration,
                    });

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
    }, [selectedCategory, rightSideBarView, selectedDate, date, calendarStartHour, timeBlockSettings.minLogDuration]);

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
                    ...(category != null && category !== "" ? {category} : {}),
                    ...(timeBlockId != null ? {timeBlockId} : {}),
                };
                setSelectedEvent(event);
                setSelectedDate(null); // Clear date selection when event is selected

                const sourceLogIds = clickInfo.event.extendedProps?.sourceLogIds as number[] | undefined;
                if (sourceLogIds?.length) {
                    const minSec = timeBlockSettings.minLogDuration;
                    const rows = await Promise.all(sourceLogIds.map((id) => get_log_by_id(id)));
                    const logs = rows
                        .filter((row) => row.duration >= minSec)
                        .map((row) => {
                            const tsSec =
                                row.timestamp instanceof Date
                                    ? Math.floor(row.timestamp.getTime() / 1000)
                                    : Number(row.timestamp as unknown as number);
                            return {
                                ids: [row.id],
                                app: row.app,
                                timestamp: new Date(tsSec * 1000),
                                duration: row.duration,
                            };
                        });
                    logs.sort((a, b) => b.duration - a.duration);
                    setSelectedEventLogs(logs);
                } else {
                    const startTime = Math.floor(event.start.getTime() / 1000);
                    const endTime = Math.floor(event.end.getTime() / 1000);
                    const appNames = event.apps.map((a) => a.app);

                    const result = await get_logs_for_time_block({
                        app_names: appNames,
                        start_time: startTime,
                        end_time: endTime,
                        min_log_duration: timeBlockSettings.minLogDuration,
                    });

                    const logs = result.map((log) => ({
                        ids: log.ids,
                        app: log.app,
                        timestamp: new Date(log.timestamp * 1000),
                        duration: log.duration,
                    }));
                    logs.sort((a, b) => b.duration - a.duration);
                    setSelectedEventLogs(logs);
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
        const cat = categories.find((c) => c.name === categoryName);
        if (cat) {
            toggleVisibleCategory(cat.id);
        }
    };

    const patchGoogleCalendar = useCallback(
        (calendarId: number, patch: Partial<Pick<GoogleCalendar, "is_visible" | "in_stats">>) => {
            queryClient.setQueryData<GoogleCalendar[]>(["googleCalendars"], (old) =>
                old?.map((c) => (c.id === calendarId ? {...c, ...patch} : c))
            );
            const updated = queryClient.getQueryData<GoogleCalendar[]>(["googleCalendars"]);
            if (updated) {
                setCachedCalendars(updated);
            }
        },
        [queryClient]
    );

    const toggleCalendarVisible = useCallback(
        async (calendarId: number) => {
            const cal = queryClient.getQueryData<GoogleCalendar[]>(["googleCalendars"])?.find(
                (c) => c.id === calendarId
            );
            if (!cal) return;
            const is_visible = !cal.is_visible;
            patchGoogleCalendar(calendarId, {is_visible});
            try {
                await update_google_calendar({id: calendarId, is_visible});
            } catch (e) {
                console.error("[GCal Calendar] Failed to update calendar visibility:", e);
                queryClient.invalidateQueries({queryKey: ["googleCalendars"]});
            }
        },
        [patchGoogleCalendar, queryClient]
    );

    const toggleCalendarInStats = useCallback(
        async (calendarId: number) => {
            const cal = queryClient.getQueryData<GoogleCalendar[]>(["googleCalendars"])?.find(
                (c) => c.id === calendarId
            );
            if (!cal) return;
            const in_stats = !cal.in_stats;
            patchGoogleCalendar(calendarId, {in_stats});
            try {
                await update_google_calendar({id: calendarId, in_stats});
            } catch (e) {
                console.error("[GCal Calendar] Failed to update calendar stats:", e);
                queryClient.invalidateQueries({queryKey: ["googleCalendars"]});
            }
        },
        [patchGoogleCalendar, queryClient]
    );


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
            queryClient.invalidateQueries({queryKey: ["logsForAppCalendar"]});
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

    const jumpToPrevAppWeek = () => {
        if (!calendarAppFilterActive || !appFilterPrevWeek) {
            return;
        }
        setDate(appFilterPrevWeek);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    const jumpToNextAppWeek = () => {
        if (!calendarAppFilterActive || !appFilterNextWeek) {
            return;
        }
        setDate(appFilterNextWeek);
        setSelectedEvent(null);
        setSelectedEventLogs([]);
        setSelectedDate(null);
        setSelectedCategory(null);
    };

    useEffect(() => {
        if (!calendarAppFilterActive) {
            setAppFilterPrevWeek(null);
            setAppFilterNextWeek(null);
            setIsResolvingAppFilterWeeks(false);
            return;
        }

        let cancelled = false;
        const findWeeks = async () => {
            setIsResolvingAppFilterWeeks(true);
            const baseWeek = getWeekStart(date, calendarStartHour);
            const nowWeek = getWeekStart(adjustInstantToCalendarDayBoundary(new Date(), calendarStartHour), calendarStartHour);
            const minBoundary = new Date(2000, 0, 1);
            const maxSteps = 520;

            const hasAppInWeek = async (targetWeek: Date): Promise<boolean> => {
                const rows = await get_week_for_app_filter(targetWeek, calendarAppFilterActive);
                return rows.length > 0;
            };

            const findPrev = async (): Promise<Date | null> => {
                const cursor = new Date(baseWeek);
                cursor.setDate(cursor.getDate() - 7);
                for (let i = 0; i < maxSteps; i += 1) {
                    if (cursor.getTime() < minBoundary.getTime()) {
                        return null;
                    }
                    if (await hasAppInWeek(cursor)) {
                        return new Date(cursor);
                    }
                    cursor.setDate(cursor.getDate() - 7);
                }
                return null;
            };

            const findNext = async (): Promise<Date | null> => {
                const cursor = new Date(baseWeek);
                cursor.setDate(cursor.getDate() + 7);
                for (let i = 0; i < maxSteps; i += 1) {
                    if (cursor.getTime() > nowWeek.getTime()) {
                        return null;
                    }
                    if (await hasAppInWeek(cursor)) {
                        return new Date(cursor);
                    }
                    cursor.setDate(cursor.getDate() + 7);
                }
                return null;
            };

            try {
                const [prevWeek, nextWeek] = await Promise.all([findPrev(), findNext()]);
                if (cancelled) {
                    return;
                }
                setAppFilterPrevWeek(prevWeek);
                setAppFilterNextWeek(nextWeek);
            } finally {
                if (!cancelled) {
                    setIsResolvingAppFilterWeeks(false);
                }
            }
        };

        void findWeeks();
        return () => {
            cancelled = true;
        };
    }, [calendarAppFilterActive, date, calendarStartHour, timeBlockSettings]);

    const appJumpNextDisabled = !calendarAppFilterActive || isResolvingAppFilterWeeks || !appFilterNextWeek;
    const appJumpPrevDisabled = !calendarAppFilterActive || isResolvingAppFilterWeeks || !appFilterPrevWeek;

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
                            onClick2={goToToday} calendarStartHour={calendarStartHour}
                            appJumpPrev={jumpToPrevAppWeek} appJumpNext={jumpToNextAppWeek}
                            appJumpPrevDisabled={appJumpPrevDisabled} appJumpNextDisabled={appJumpNextDisabled}/>

            <div className="flex flex-1 overflow-hidden min-h-0">
                <div className="flex-1 overflow-hidden min-h-0">
                    <div className="h-full min-h-0 flex flex-col" onClick={handleCalendarClick}>
                        <RenderCalendarContent
                            ref={calenderRef}
                            date={date}
                            categoryColorMap={categoryColorMap}
                            visibleCategories={visibleCategoryNames}
                            categories={categories}
                            toggleCategory={toggleCategory}
                            checkAllCategories={checkAllCategories}
                            uncheckAllCategories={uncheckAllCategories}
                            handleEventClick={handleEventClick}
                            onDatesSet={handleDatesSet}
                            googleCalendarMap={googleCalendarMap}
                            googleCalendars={displayCalendars}
                            toggleCalendarVisible={toggleCalendarVisible}
                            toggleCalendarInStats={toggleCalendarInStats}
                            onTimeBlockContextMenu={openFromContextMenuMany}
                        />
                    </div>
                </div>
                <RightSideBar selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent}
                              setSelectedEventLogs={setSelectedEventLogs} selectedEventLogs={selectedEventLogs}
                              view={rightSideBarView} setView={setRightSideBarView} selectedDate={selectedDate}
                              setSelectedDate={setSelectedDate} setCurrentView={setCurrentView}
                              selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
                              isLoadingCategory={isLoadingCategory}
                              googleCalendars={displayCalendars}
                />
            </div>
            {categorizeLayers}


        </div>
    );
}
