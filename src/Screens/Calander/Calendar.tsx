import {useQuery, useQueryClient} from "@tanstack/react-query";
import {get_categories, Category, update_category_by_id} from "../../api/Category.ts";
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
import {getDevices, getCalendarDevices, buildDeviceUuidsForFilter, updateDevice, getServerIp, type Device} from "../../api/sync.ts";
import {useBackendSettings} from "../../hooks/useBackendSettings.ts";
import {getAppMetadata, setAppMetadata} from "../../api/appMetadata.ts";

const INCLUDE_GOOGLE_IN_STATS_KEY = "time-tracker:include-google-in-stats";

export default function Calendar({setCurrentView}: { setCurrentView: (arg0: View) => void }) {
    const [rightSideBarView, setRightSideBarView] = useState<SideBarView>("Week")
    const {date, setDate} = useDateStore();
    const {calendarStartHour, timeBlockSettings} = useBackendSettings();
    const calendarAppFilterActive = useCalendarAppFilterActive();
    const [includeGoogleInStats, setIncludeGoogleInStats] = useState(true);
    const includeGoogleInStatsLoadedRef = useRef(false);
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

    const visibleCategoryNames = useMemo(() => {
        const names = new Set<string>();
        for (const cat of categories) {
            if (cat.is_visible) names.add(cat.name);
        }
        return names;
    }, [categories]);

    const statsCategoryNames = useMemo(() => {
        const names = new Set<string>();
        for (const cat of categories) {
            if (cat.in_stats) names.add(cat.name);
        }
        return names;
    }, [categories]);

    const {data: serverIp} = useQuery({
        queryKey: ["sync", "serverIp"],
        queryFn: getServerIp,
    });

    const {data: devices = []} = useQuery({
        queryKey: ["sync", "devices"],
        queryFn: getDevices,
        enabled: !!serverIp,
    });

    const calendarDevices = useMemo(() => getCalendarDevices(devices), [devices]);

    const calDeviceUuids = useMemo(
        () => buildDeviceUuidsForFilter(calendarDevices, (d) => d.in_cal),
        [calendarDevices],
    );

    const statsDeviceUuids = useMemo(
        () => buildDeviceUuidsForFilter(calendarDevices, (d) => d.in_cal && d.in_stats),
        [calendarDevices],
    );

    useEffect(() => {
        getAppMetadata(INCLUDE_GOOGLE_IN_STATS_KEY)
            .then((raw) => {
                if (raw === "0") setIncludeGoogleInStats(false);
                else if (raw === "1") setIncludeGoogleInStats(true);
            })
            .catch(() => {})
            .finally(() => {
                includeGoogleInStatsLoadedRef.current = true;
            });
    }, []);

    useEffect(() => {
        if (!includeGoogleInStatsLoadedRef.current) return;
        setAppMetadata(INCLUDE_GOOGLE_IN_STATS_KEY, includeGoogleInStats ? "1" : "0").catch(() => {});
    }, [includeGoogleInStats]);

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
        queryFn: async () => {
            const cals = await get_google_calendars();
            setCachedCalendars(cals);
            return cals;
        },
        placeholderData: () => getCachedCalendars() ?? undefined,
    });

    if (googleCalendarsError) {
        console.error("[GCal Calendar] calendar fetch error:", googleCalendarsError);
    }

    const displayCalendars = googleCalendars ?? getCachedCalendars() ?? [];

    useEffect(() => {
        if (googleCalendars) {
            setCachedCalendars(googleCalendars);
        }
    }, [googleCalendars]);

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
            calDeviceUuids,
        ],
        queryFn: async () => {
            try {
                const rows = await get_week(weekStart, calDeviceUuids);
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
                        device_uuid: string | null,
                        app: string,
                        app_names: string[],
                        timestamp: Date,
                        duration: number
                    }>();

                    result.forEach(log => {
                        const logKey = `${log.device_uuid}\u0000${log.app}`;
                        const existing = logMap.get(logKey);
                        if (existing) {
                            existing.ids.push(...log.ids);
                            existing.duration += log.duration;
                            for (const appName of log.app_names) {
                                if (!existing.app_names.includes(appName)) existing.app_names.push(appName);
                            }
                            const logTimestamp = new Date(log.timestamp * 1000);
                            if (logTimestamp < existing.timestamp) {
                                existing.timestamp = logTimestamp;
                            }
                        } else {
                            logMap.set(logKey, {
                                ids: [...log.ids],
                                device_uuid: log.device_uuid,
                                app: log.app,
                                app_names: [...log.app_names],
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
                            appNames: log.app_names,
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
                    apps: (clickInfo.event.extendedProps?.apps || []) as { app: string; appNames: string[]; totalDuration: number }[],
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
                                device_uuid: row.device_uuid,
                                app: row.app,
                                app_names: [row.app],
                                timestamp: new Date(tsSec * 1000),
                                duration: row.duration,
                            };
                        });
                    logs.sort((a, b) => b.duration - a.duration);
                    setSelectedEventLogs(logs);
                } else {
                    const startTime = Math.floor(event.start.getTime() / 1000);
                    const endTime = Math.floor(event.end.getTime() / 1000);
                    const appNames = Array.from(new Set(event.apps.flatMap((a) => a.appNames)));

                    const result = await get_logs_for_time_block({
                        app_names: appNames,
                        start_time: startTime,
                        end_time: endTime,
                        min_log_duration: timeBlockSettings.minLogDuration,
                    });

                    const logs = result.map((log) => ({
                        ids: log.ids,
                        device_uuid: log.device_uuid,
                        app: log.app,
                        app_names: log.app_names,
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


    const toggleCategory = useCallback(
        async (categoryId: number, field: "is_visible" | "in_stats") => {
            const cat = queryClient.getQueryData<Category[]>(["categories"])?.find((c) => c.id === categoryId);
            if (!cat) return;
            const updated = {...cat, [field]: !cat[field]};
            queryClient.setQueryData<Category[]>(["categories"], (old) =>
                old?.map((c) => (c.id === categoryId ? updated : c))
            );
            try {
                await update_category_by_id(updated);
            } catch (e) {
                console.error("[Calendar] Failed to update category:", e);
                await queryClient.invalidateQueries({queryKey: ["categories"]});
            }
        },
        [queryClient]
    );

    const toggleCategoryVisible = useCallback(
        (categoryId: number) => toggleCategory(categoryId, "is_visible"),
        [toggleCategory]
    );

    const toggleCategoryInStats = useCallback(
        (categoryId: number) => toggleCategory(categoryId, "in_stats"),
        [toggleCategory]
    );

    const allCategoriesInCal = useMemo(
        () => categories.length > 0 && categories.every((c) => c.is_visible),
        [categories],
    );

    const allCategoriesInStats = useMemo(
        () => categories.length > 0 && categories.every((c) => c.in_stats),
        [categories],
    );

    const toggleAllCategoriesVisible = useCallback(async () => {
        const next = !categories.every((c) => c.is_visible);
        const updated = categories.map((c) => ({...c, is_visible: next}));
        queryClient.setQueryData<Category[]>(["categories"], updated);
        try {
            await Promise.all(updated.map((c) => update_category_by_id(c)));
        } catch (e) {
            console.error("[Calendar] Failed to update all category visibility:", e);
            await queryClient.invalidateQueries({queryKey: ["categories"]});
        }
    }, [categories, queryClient]);

    const toggleAllCategoriesInStats = useCallback(async () => {
        const next = !categories.every((c) => c.in_stats);
        const updated = categories.map((c) => ({...c, in_stats: next}));
        queryClient.setQueryData<Category[]>(["categories"], updated);
        try {
            await Promise.all(updated.map((c) => update_category_by_id(c)));
        } catch (e) {
            console.error("[Calendar] Failed to update all category stats:", e);
            await queryClient.invalidateQueries({queryKey: ["categories"]});
        }
    }, [categories, queryClient]);

    const patchDevice = useCallback(
        (uuid: string, patch: Partial<Pick<Device, "in_cal" | "in_stats">>) => {
            queryClient.setQueryData<Device[]>(["sync", "devices"], (old) =>
                old?.map((d) => (d.uuid === uuid ? {...d, ...patch} : d))
            );
        },
        [queryClient]
    );

    const toggleDeviceInCal = useCallback(
        async (uuid: string) => {
            const device = queryClient.getQueryData<Device[]>(["sync", "devices"])?.find((d) => d.uuid === uuid);
            if (!device) return;
            const in_cal = !device.in_cal;
            patchDevice(uuid, {in_cal});
            try {
                await updateDevice({uuid, in_cal});
            } catch (e) {
                console.error("[Calendar] Failed to update device cal:", e);
                await queryClient.invalidateQueries({queryKey: ["sync", "devices"]});
            }
        },
        [patchDevice, queryClient]
    );

    const toggleDeviceInStats = useCallback(
        async (uuid: string) => {
            const device = queryClient.getQueryData<Device[]>(["sync", "devices"])?.find((d) => d.uuid === uuid);
            if (!device) return;
            const in_stats = !device.in_stats;
            patchDevice(uuid, {in_stats});
            try {
                await updateDevice({uuid, in_stats});
            } catch (e) {
                console.error("[Calendar] Failed to update device stats:", e);
                await queryClient.invalidateQueries({queryKey: ["sync", "devices"]});
            }
        },
        [patchDevice, queryClient]
    );

    const toggleCalendarVisible = useCallback(
        async (calendarId: number) => {
            const previous =
                queryClient.getQueryData<GoogleCalendar[]>(["googleCalendars"]) ??
                getCachedCalendars() ??
                displayCalendars;
            const cal = previous?.find((c) => c.id === calendarId);
            if (!cal) return;
            const is_visible = !cal.is_visible;
            const updated = previous.map((c) =>
                c.id === calendarId ? {...c, is_visible} : c
            );
            queryClient.setQueryData<GoogleCalendar[]>(["googleCalendars"], updated);
            setCachedCalendars(updated);
            try {
                await update_google_calendar({id: calendarId, is_visible});
            } catch (e) {
                console.error("[GCal Calendar] Failed to update calendar visibility:", e);
                queryClient.setQueryData<GoogleCalendar[]>(["googleCalendars"], previous);
                setCachedCalendars(previous);
            }
        },
        [displayCalendars, queryClient]
    );

    const toggleCalendarInStats = useCallback(
        async (calendarId: number) => {
            const previous =
                queryClient.getQueryData<GoogleCalendar[]>(["googleCalendars"]) ??
                getCachedCalendars() ??
                displayCalendars;
            const cal = previous?.find((c) => c.id === calendarId);
            if (!cal) return;
            const in_stats = !cal.in_stats;
            const updated = previous.map((c) =>
                c.id === calendarId ? {...c, in_stats} : c
            );
            queryClient.setQueryData<GoogleCalendar[]>(["googleCalendars"], updated);
            setCachedCalendars(updated);
            try {
                await update_google_calendar({id: calendarId, in_stats});
            } catch (e) {
                console.error("[GCal Calendar] Failed to update calendar stats:", e);
                queryClient.setQueryData<GoogleCalendar[]>(["googleCalendars"], previous);
                setCachedCalendars(previous);
            }
        },
        [displayCalendars, queryClient]
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
                const rows = await get_week_for_app_filter(targetWeek, calendarAppFilterActive, calDeviceUuids);
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
    }, [calendarAppFilterActive, date, calendarStartHour, timeBlockSettings, calDeviceUuids]);

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
                            toggleCategoryVisible={toggleCategoryVisible}
                            toggleCategoryInStats={toggleCategoryInStats}
                            allCategoriesInCal={allCategoriesInCal}
                            allCategoriesInStats={allCategoriesInStats}
                            toggleAllCategoriesVisible={toggleAllCategoriesVisible}
                            toggleAllCategoriesInStats={toggleAllCategoriesInStats}
                            calendarDevices={calendarDevices}
                            toggleDeviceInCal={toggleDeviceInCal}
                            toggleDeviceInStats={toggleDeviceInStats}
                            calDeviceUuids={calDeviceUuids}
                            handleEventClick={handleEventClick}
                            onDatesSet={handleDatesSet}
                            googleCalendarMap={googleCalendarMap}
                            googleCalendars={displayCalendars}
                            toggleCalendarVisible={toggleCalendarVisible}
                            toggleCalendarInStats={toggleCalendarInStats}
                            includeGoogleInStats={includeGoogleInStats}
                            setIncludeGoogleInStats={setIncludeGoogleInStats}
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
                              includeGoogleInStats={includeGoogleInStats}
                              googleCalendars={displayCalendars}
                              statsCategoryNames={statsCategoryNames}
                              statsDeviceUuids={statsDeviceUuids}
                />
            </div>
            {categorizeLayers}


        </div>
    );
}
