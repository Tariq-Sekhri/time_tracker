import { toErrorString } from "../../types/common.ts";
import {reportError} from "../../diagnostics.ts";
import {useRenderPerf} from "../../perf.ts";
import { get_week, get_week_for_app_filter, TimeBlock } from "../../api/week.ts";
import CalendarSkeleton from "./CalanderSkeletion.tsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { getCategoryColor, getWeekStart, formatDuration, formatLocalDateYMD } from "./utils.ts";
import { Category } from "../../api/Category.ts";
import { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import interactionPlugin from '@fullcalendar/interaction';
import {
    get_all_google_calendar_events,
    google_oauth_login,
    GoogleCalendarEvent,
    GoogleCalendar,
    isGoogleCalendarEventExcludedFromTimeStats,
} from "../../api/GoogleCalendar.ts";
import { getWeekRange } from "../../utils.ts";
import { getCachedEvents, setCachedEvents } from "../../stores/googleCalendarCache.ts";
import { useToast } from "../../Componants/Toast.tsx";
import { getAppMetadata, setAppMetadata } from "../../api/appMetadata.ts";
import { useCalendarAppFilterActive } from "../../stores/calendarAppFilterStore.ts";
import { useBackendSettings } from "../../hooks/useBackendSettings.ts";
import LeftSideBar, { LeftSidebarPicker, SidebarSection, useLeftSidebarUi } from "./LeftSideBar.tsx";
import { Device } from "../../api/sync.ts";
import {get_manual_time_blocks, MANUAL_TIME_COLOR} from "../../api/ManualTimeBlock.ts";

import {getManualProjects, MANUAL_PROJECTS_QUERY_KEY} from "../../api/ManualProject.ts";
import {ManualProjectFilter} from "../../hooks/useManualProjectFilters.ts";

import {CalendarIsolation} from "../../hooks/useCalendarIsolation.ts";

const LEFT_SIDEBAR_COLLAPSED_KEY = "time-tracker:left-sidebar-collapsed";

interface RenderCalendarContentProps {
    isolation: CalendarIsolation;
    ref: any;
    date: Date;
    visibleCategories: Set<string>;
    categoryColorMap: Map<string, string>;
    categories: Category[];
    toggleCategoryVisible: (categoryId: number) => void;
    toggleCategoryInStats: (categoryId: number) => void;
    allCategoriesInCal: boolean;
    allCategoriesInStats: boolean;
    toggleAllCategoriesVisible: () => void;
    toggleAllCategoriesInStats: () => void;
    calendarDevices: Device[];
    toggleDeviceInCal: (uuid: string) => void;
    toggleDeviceInStats: (uuid: string) => void;
    calDeviceUuids: string[] | null;
    handleEventClick: (clickInfo: EventClickArg) => void;
    onDatesSet: (dates: DatesSetArg) => void;
    googleCalendarMap: Map<number, GoogleCalendar>;
    googleCalendars: GoogleCalendar[];
    toggleCalendarVisible: (calendarId: number) => void;
    toggleCalendarInStats: (calendarId: number) => void;
    includeGoogleInStats: boolean;
    toggleAllGoogleCalendarsInCal: () => void;
    toggleAllGoogleCalendarsInStats: () => void;
    isManualTimeInCal: ManualProjectFilter;
    manualProjectFiltersLoaded: boolean;
    isolatedProject: {id: number | null} | null;
    toggleIsolateProject: (id: number | null) => void;
    toggleAllManualTimeInCal: (ids: (number | null)[]) => void;
    toggleAllManualTimeInStats: (ids: (number | null)[]) => void;
    isManualTimeInStats: ManualProjectFilter;
    toggleManualTimeInCal: (id: number | null) => void;
    toggleManualTimeInStats: (id: number | null) => void;
    onTimeBlockContextMenu?: (e: globalThis.MouseEvent, appNames: string[]) => void;
}

export default function RenderCalendarContent({
    isolation,
    ref,
    date,
    visibleCategories,
    categoryColorMap,
    categories,
    toggleCategoryVisible,
    toggleCategoryInStats,
    allCategoriesInCal,
    allCategoriesInStats,
    toggleAllCategoriesVisible,
    toggleAllCategoriesInStats,
    calendarDevices,
    toggleDeviceInCal,
    toggleDeviceInStats,
    calDeviceUuids,
    handleEventClick,
    onDatesSet,
    googleCalendarMap,
    googleCalendars,
    toggleCalendarVisible,
    toggleCalendarInStats,
    includeGoogleInStats,
    toggleAllGoogleCalendarsInCal,
    toggleAllGoogleCalendarsInStats,
    isManualTimeInCal,
    manualProjectFiltersLoaded,
    isolatedProject,
    toggleIsolateProject,
    toggleAllManualTimeInCal,
    toggleAllManualTimeInStats,
    isManualTimeInStats,
    toggleManualTimeInCal,
    toggleManualTimeInStats,
    onTimeBlockContextMenu,
}: RenderCalendarContentProps) {
    const queryClient = useQueryClient();
    const {data: manualProjects = [], error: manualProjectsError} = useQuery({queryKey: MANUAL_PROJECTS_QUERY_KEY, queryFn: getManualProjects});
    const manualSources = [{id: null, name: "No project"}, ...manualProjects];
    const manualSourceIds = manualSources.map((project) => project.id);
    const { showToast, updateToast, removeToast } = useToast();
    const lastGoogleEventsErrorToastRef = useRef<string | null>(null);
    const calendarHostRef = useRef<HTMLDivElement>(null);
    const [isRelogging, setIsRelogging] = useState(false);
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
    const [leftSidebarUi, setLeftSidebarUi] = useLeftSidebarUi();

    const { calendarStartHour, calendarHeight, timeBlockSettings } = useBackendSettings();
    const calendarAppFilter = useCalendarAppFilterActive();
    const slotMinHeightPx = Math.max(12, Math.round((calendarHeight / 100) * 24));

    const handleRelogin = async () => {
        setIsRelogging(true);
        const toastId = showToast("Opening browser for Google sign-in…", "loading", 0);
        const timeoutId = setTimeout(() => {
            updateToast(
                toastId,
                "Google login timed out",
                "error",
                "No response received from Google OAuth within 2 minutes. If a browser window opened, complete the login and try again. If nothing opened, your default browser may be blocked from launching."
            );
        }, 125_000);
        try {
            await google_oauth_login();
            clearTimeout(timeoutId);
            updateToast(toastId, "Re-connected to Google Calendar", "success");
            setTimeout(() => removeToast(toastId), 2000);
            await queryClient.invalidateQueries({ queryKey: ["googleAuthStatus"] });
            await queryClient.invalidateQueries({ queryKey: ["googleCalendars"] });
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            await refetchGoogleEvents();
        } catch (e) {
            clearTimeout(timeoutId);
            console.error("[GCal] Re-login error:", e);
            updateToast(toastId, "Re-login error", "error", toErrorString(e));
        } finally {
            setIsRelogging(false);
        }
    };

    const weekStart = getWeekStart(date, calendarStartHour);
    const slotMinTime = `${String(calendarStartHour).padStart(2, "0")}:00:00`;
    const slotMaxTime = `${String(calendarStartHour + 24).padStart(2, "0")}:00:00`;
    const scrollTime = slotMinTime;
    const weekQueryEnabled = !!weekStart && !isNaN(weekStart.getTime());
    const { data, isLoading, error, dataUpdatedAt } = useQuery({
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
                console.error("[Week] queryFn threw:", e);
                console.error("[Week] toErrorString:", toErrorString(e));
                console.error("[Week] typeof:", typeof e, "instanceof Error:", e instanceof Error);
                throw e;
            }
        },
        enabled: weekQueryEnabled,
        // Calendar owns focus refreshes so native/webview events cannot restart a slow request.
        refetchOnWindowFocus: false,
    });

    const {
        data: filteredData,
        isLoading: isLoadingFilteredData,
        error: filteredDataError,
        dataUpdatedAt: filteredDataUpdatedAt,
    } = useQuery({
        queryKey: [
            "week_app_filter",
            formatLocalDateYMD(weekStart),
            calendarAppFilter,
            calendarStartHour,
            timeBlockSettings.minLogDuration,
            timeBlockSettings.maxAttachDistance,
            timeBlockSettings.lookaheadWindow,
            timeBlockSettings.minDuration,
            calDeviceUuids,
        ],
        queryFn: async () => {
            if (!calendarAppFilter) {
                return [];
            }
            return get_week_for_app_filter(weekStart, calendarAppFilter, calDeviceUuids);
        },
        enabled: weekQueryEnabled && Boolean(calendarAppFilter),
        refetchOnWindowFocus: false,
    });

    const weekRange = useMemo(
        () => getWeekRange(date, calendarStartHour),
        [date, calendarStartHour]
    );

    const {
        data: manualTimeBlocks = [],
        isLoading: isLoadingManualTime,
        error: manualTimeError,
    } = useQuery({
        queryKey: ["manualTimeBlocks", weekRange.week_start, weekRange.week_end],
        queryFn: () => get_manual_time_blocks(weekRange.week_start, weekRange.week_end + 1),
        enabled: weekQueryEnabled,
        refetchOnWindowFocus: true,
    });

    const calendarIds = useMemo(() => googleCalendars.map(cal => cal.id).sort().join(','), [googleCalendars]);
    
    const queryEnabled = !!weekStart && !isNaN(weekStart.getTime()) && googleCalendars.length > 0;

    const {
        data: googleCalendarEvents,
        refetch: refetchGoogleEvents,
        error: googleEventsError,
        isLoading: isLoadingGoogleEvents,
        isError: isGoogleEventsError
    } = useQuery({
        queryKey: [
            "googleCalendarEvents",
            weekRange.week_start,
            weekRange.week_end,
            calendarStartHour,
            calendarIds,
        ],
        queryFn: () =>
            get_all_google_calendar_events(weekRange.week_start, weekRange.week_end),
        enabled: queryEnabled,
        refetchOnWindowFocus: true,
    });

    const cachedEvents = useMemo(
        () => getCachedEvents(weekRange.week_start, weekRange.week_end, calendarIds),
        [weekRange.week_start, weekRange.week_end, calendarIds],
    );
    const isAuthExpired = isGoogleEventsError && googleEventsError?.message?.includes("auth expired");
    const displayGoogleEvents = googleCalendarEvents ?? cachedEvents ?? [];
    const isShowingCachedEvents = isGoogleEventsError && !isAuthExpired && (cachedEvents?.length ?? 0) > 0;

    useEffect(() => {
        if (googleCalendarEvents && googleCalendarEvents.length >= 0) {
            setCachedEvents(weekRange.week_start, weekRange.week_end, calendarIds, googleCalendarEvents);
        }
    }, [googleCalendarEvents, weekRange.week_start, weekRange.week_end, calendarIds]);

    useEffect(() => {
        if (googleEventsError) {
            console.error("[GCal Render] ERROR fetching Google Calendar events:", googleEventsError);
            console.error("[GCal Render] Error details:", JSON.stringify(googleEventsError, null, 2));
        }
    }, [googleEventsError]);

    useEffect(() => {
        if (!googleEventsError) {
            lastGoogleEventsErrorToastRef.current = null;
            return;
        }

        if (isAuthExpired) return;

        const errorText = toErrorString(googleEventsError);
        const dnsLike =
            /dns error|No such host is known|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(errorText) ||
            /connect/i.test(errorText);

        if (lastGoogleEventsErrorToastRef.current === errorText) return;
        lastGoogleEventsErrorToastRef.current = errorText;

        if (isShowingCachedEvents) {
            showToast(
                dnsLike ? "No internet connection. Using cached Google Calendar events." : "Using cached Google Calendar events.",
                "error",
                5000,
                errorText
            );
        } else {
            showToast(
                dnsLike ? "No internet connection. Couldn't load Google Calendar events." : "Couldn't load Google Calendar events.",
                "error",
                5000,
                errorText
            );
        }
    }, [googleEventsError, isAuthExpired, isShowingCachedEvents, showToast]);

    useEffect(() => {
        getAppMetadata(LEFT_SIDEBAR_COLLAPSED_KEY)
            .then((raw) => setIsLeftCollapsed(raw === "1"))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setAppMetadata(LEFT_SIDEBAR_COLLAPSED_KEY, isLeftCollapsed ? "1" : "0").catch(() => {});
    }, [isLeftCollapsed]);

    const displayedTimeBlocks = calendarAppFilter ? (filteredData ?? []) : (data ?? []);

    const isCalendarVisible = useCallback(
        (calendarId: number) => isolation.calendar !== null ? calendarId === isolation.calendar : googleCalendarMap.get(calendarId)?.is_visible ?? false,
        [googleCalendarMap, isolation.calendar]
    );

    const events = useMemo(() => {
        const googleEvents = (!isolation.showGoogle || (calendarAppFilter && isolation.calendar === null))
            ? []
            : displayGoogleEvents
                  .filter((event: GoogleCalendarEvent) => isCalendarVisible(event.calendar_id))
                  .map((event: GoogleCalendarEvent) => {
                      if (isGoogleCalendarEventExcludedFromTimeStats(event)) {
                          return null;
                      }

                      const start = new Date(event.start * 1000);
                      const end = new Date(event.end * 1000);

                      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                          return null;
                      }

                      const calendar = googleCalendarMap.get(event.calendar_id);
                      const color = calendar?.color || "#4285f4";
                      const eventDurationSec = event.end - event.start;

                      return {
                          id: `google-${event.event_id}-${event.calendar_id}`,
                          title: `${event.title} (${formatDuration(eventDurationSec)})`,
                          start: start.toISOString(),
                          end: end.toISOString(),
                          backgroundColor: color,
                          borderColor: color,
                          textColor: "#ffffff",
                          extendedProps: {
                              type: "google_calendar",
                              eventId: event.event_id,
                              calendarId: event.calendar_id,
                              description: event.description,
                              location: event.location,
                          },
                      };
                  })
                  .filter((e): e is NonNullable<typeof e> => e !== null);

        const timeBlockEvents = (isolation.showTracked ? displayedTimeBlocks : [])
            .filter((block: TimeBlock) => {
                if (!visibleCategories.has(block.category)) {
                    return false;
                }
                return true;
            })
            .map((block: TimeBlock) => {
                const startMs = block.startTime * 1000;
                const endMs = block.endTime * 1000;
                const start = new Date(startMs);
                const end = new Date(endMs);

                if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                    return null;
                }

                const dbColor = categoryColorMap.get(block.category);
                const color = getCategoryColor(block.category, dbColor);
                const filteredApp = calendarAppFilter
                    ? block.apps.find((app) => app.app === calendarAppFilter)?.app
                    : null;

                const blockDurationSec = block.endTime - block.startTime;
                return {
                    id: `timeblock-${block.id}`,
                    title: `${filteredApp ?? block.category} (${formatDuration(blockDurationSec)})`,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    backgroundColor: color,
                    borderColor: color,
                    textColor: "#ffffff",
                    extendedProps: {
                        apps: block.apps,
                        type: "timeblock",
                        ...(calendarAppFilter ? {} : { timeBlockId: block.id }),
                        category: block.category,
                    },
                };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null);

        const manualEvents = !isolation.showManual || (calendarAppFilter && !isolatedProject)
            ? []
            : manualTimeBlocks.filter((block) => isManualTimeInCal(block.project_id)).map((block) => {
                const durationSec = block.end_time - block.start_time;
                return {
                    id: `manual-${block.id}`,
                    title: `${block.title} (${formatDuration(durationSec)})`,
                    start: new Date(block.start_time * 1000).toISOString(),
                    end: new Date(block.end_time * 1000).toISOString(),
                    backgroundColor: MANUAL_TIME_COLOR,
                    borderColor: MANUAL_TIME_COLOR,
                    textColor: "#ffffff",
                    extendedProps: {
                        type: "manual_time",
                        manualTimeBlockId: block.id,
                        projectId: block.project_id,
                        manualTitle: block.title,
                        notes: block.notes,
                    },
                };
            });

        return [...timeBlockEvents, ...manualEvents, ...googleEvents];
    }, [
        displayedTimeBlocks,
        categoryColorMap,
        visibleCategories,
        displayGoogleEvents,
        isCalendarVisible,
        googleCalendarMap,
        calendarAppFilter,
        manualTimeBlocks,
        isManualTimeInCal,
        isolatedProject,
        isolation.showTracked,
        isolation.showGoogle,
        isolation.showManual,
        isolation.calendar,
    ]);

    const showFullCalendarGrid = useMemo(() => {
        if (isolation.active) return true;
        if (isLoading || (isLoadingGoogleEvents && !(cachedEvents?.length ?? 0))) return false;
        if (calendarAppFilter && isLoadingFilteredData) return false;
        if (error || filteredDataError) return false;
        const hasTimeBlocks = !isolatedProject && displayedTimeBlocks.length > 0;
        const hasGoogleEvents =
            !calendarAppFilter && !isolatedProject &&
            displayGoogleEvents.length > 0 &&
            displayGoogleEvents.some((event: GoogleCalendarEvent) => isCalendarVisible(event.calendar_id));
        const hasManualTime = (!calendarAppFilter || isolatedProject) && manualTimeBlocks.some((block) => isManualTimeInCal(block.project_id));
        return !!(hasTimeBlocks || hasManualTime || hasGoogleEvents);
    }, [
        isolation.active,
        isLoading,
        isLoadingGoogleEvents,
        cachedEvents,
        error,
        filteredDataError,
        displayedTimeBlocks,
        displayGoogleEvents,
        isCalendarVisible,
        manualTimeBlocks,
        isManualTimeInCal,
        calendarAppFilter,
        isLoadingFilteredData,
        isolatedProject,
        isolation.showTracked,
        isolation.showGoogle,
        isolation.showManual,
        isolation.calendar,
    ]);

    useEffect(() => {
        if (!showFullCalendarGrid) return;
        const el = calendarHostRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let raf = 0;
        const schedule = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                try {
                    ref?.current?.getApi?.()?.updateSize?.();
                } catch (error) {
                    void reportError("Resize calendar", error);
                }
            });
        };
        const ro = new ResizeObserver(schedule);
        ro.observe(el);
        schedule();
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [ref, showFullCalendarGrid, slotMinHeightPx]);

    useLayoutEffect(() => {
        if (!showFullCalendarGrid) return;
        let alive = true;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const sync = () => {
            if (!alive) return;
            try {
                const api = ref?.current?.getApi?.();
                api?.render?.();
                api?.updateSize?.();
            } catch (error) {
                void reportError("Render/update calendar size", error);
            }
        };
        sync();
        timers.push(setTimeout(sync, 0));
        timers.push(setTimeout(sync, 80));
        let rafOuter = 0;
        let rafInner = 0;
        rafOuter = requestAnimationFrame(() => {
            rafInner = requestAnimationFrame(() => {
                if (alive) sync();
            });
        });
        return () => {
            alive = false;
            cancelAnimationFrame(rafOuter);
            cancelAnimationFrame(rafInner);
            timers.forEach(clearTimeout);
        };
    }, [events, showFullCalendarGrid, ref, slotMinHeightPx]);

    const isPageLoading = (isolation.showTracked && (isLoading || (calendarAppFilter && (isLoadingFilteredData || !filteredData)))) ||
        (isolation.showGoogle && isLoadingGoogleEvents && !(cachedEvents?.length ?? 0));

    const pageError = isolation.showTracked ? error ?? filteredDataError : null;

    useRenderPerf(
        "calendar_week",
        `${formatLocalDateYMD(weekStart)}|${calendarAppFilter ?? ""}|${calDeviceUuids?.join(",") ?? "all"}`,
        !isPageLoading,
        calendarAppFilter ? filteredDataUpdatedAt : dataUpdatedAt,
        {
            week: formatLocalDateYMD(weekStart),
            blocks: displayedTimeBlocks.length,
            events: events.length,
            grid: showFullCalendarGrid,
            app_filter: Boolean(calendarAppFilter),
        },
    );

    // Every source the left sidebar lists, with its week / stats / isolate toggles.
    const sidebarSections: SidebarSection[] = [
        {
            key: "categories",
            title: "Categories",
            all: {
                inCal: isolation.category === null && allCategoriesInCal,
                inStats: allCategoriesInStats,
                onToggleCal: toggleAllCategoriesVisible,
                onToggleStats: toggleAllCategoriesInStats,
            },
            items: categories.map((category) => ({
                key: String(category.id),
                name: category.name,
                color: getCategoryColor(category.name, categoryColorMap.get(category.name)),
                inCal: isolation.category !== null ? isolation.category === category.id : category.is_visible,
                inStats: isolation.category !== null ? isolation.category === category.id : category.in_stats,
                isolated: isolation.category === category.id,
                onToggleIsolate: () => isolation.toggleCategory(category.id),
                onToggleCal: () => toggleCategoryVisible(category.id),
                onToggleStats: () => toggleCategoryInStats(category.id),
            })),
        },
        ...(calendarDevices.length > 0 ? [{
            key: "devices" as const,
            title: "Devices",
            items: calendarDevices.map((device) => ({
                key: device.uuid,
                name: device.name,
                color: "#6b7280",
                inCal: isolation.device !== null ? isolation.device === device.uuid : device.in_cal,
                inStats: isolation.device !== null ? isolation.device === device.uuid : device.in_stats,
                isolated: isolation.device === device.uuid,
                onToggleIsolate: () => isolation.toggleDevice(device.uuid),
                onToggleCal: () => toggleDeviceInCal(device.uuid),
                onToggleStats: () => toggleDeviceInStats(device.uuid),
            })),
        }] : []),
        {
            key: "manual",
            title: "Manual tracking",
            all: {
                inCal: manualSourceIds.every(isManualTimeInCal),
                inStats: manualSourceIds.every(isManualTimeInStats),
                onToggleCal: () => toggleAllManualTimeInCal(manualSourceIds),
                onToggleStats: () => toggleAllManualTimeInStats(manualSourceIds),
                disabled: !manualProjectFiltersLoaded,
            },
            items: manualSources.map((project) => ({
                key: String(project.id ?? "none"),
                name: project.name,
                color: MANUAL_TIME_COLOR,
                inCal: isManualTimeInCal(project.id),
                inStats: isManualTimeInStats(project.id),
                isolated: isolatedProject?.id === project.id,
                onToggleIsolate: () => toggleIsolateProject(project.id),
                onToggleCal: () => toggleManualTimeInCal(project.id),
                onToggleStats: () => toggleManualTimeInStats(project.id),
                disabled: !manualProjectFiltersLoaded,
            })),
            error: manualProjectsError ? "Couldn't load projects" : undefined,
        },
        {
            key: "google",
            title: "Google Calendars",
            all: {
                inCal: isolation.calendar === null && googleCalendars.length > 0 && googleCalendars.every((calendar) => calendar.is_visible),
                inStats: isolation.calendar === null && includeGoogleInStats && googleCalendars.length > 0 && googleCalendars.every((calendar) => calendar.in_stats),
                onToggleCal: toggleAllGoogleCalendarsInCal,
                onToggleStats: toggleAllGoogleCalendarsInStats,
                disabled: googleCalendars.length === 0,
            },
            items: googleCalendars.map((calendar) => ({
                key: String(calendar.id),
                name: calendar.name,
                color: calendar.color,
                inCal: isCalendarVisible(calendar.id),
                inStats: isolation.calendar !== null ? isolation.calendar === calendar.id : calendar.in_stats,
                isolated: isolation.calendar === calendar.id,
                onToggleIsolate: () => isolation.toggleCalendar(calendar.id),
                onToggleCal: () => toggleCalendarVisible(calendar.id),
                onToggleStats: () => toggleCalendarInStats(calendar.id),
            })),
            emptyText: "No calendars added",
        },
    ];

    return (
        <div className="flex flex-1 overflow-hidden h-full min-h-0 flex flex-col">
            <LeftSidebarPicker ui={leftSidebarUi} onChange={setLeftSidebarUi}/>
            {isAuthExpired && (
                <div className="flex-shrink-0 px-4 py-2 bg-red-900/50 border-b border-red-700/50 text-red-200 text-sm flex items-center justify-between">
                    <span>Google Calendar session expired. Re-connect to see your events.</span>
                    <button
                        onClick={handleRelogin}
                        disabled={isRelogging}
                        className="ml-4 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white text-sm font-medium transition-colors"
                    >
                        {isRelogging ? "Connecting..." : "Re-connect"}
                    </button>
                </div>
            )}
            {isShowingCachedEvents && (
                <div
                    className="flex-shrink-0 px-4 py-2 bg-amber-900/50 border-b border-amber-700/50 text-amber-200 text-sm">
                    Showing cached calendar events (offline or sync failed). New changes may not appear until connection
                    is restored.
                </div>
            )}
            <div className="flex flex-1 overflow-hidden min-h-0">
                <LeftSideBar ui={leftSidebarUi} sections={sidebarSections}
                             collapsed={isLeftCollapsed} onToggleCollapsed={() => setIsLeftCollapsed((v) => !v)}/>
                <div
                    ref={calendarHostRef}
                    className="calendar-fc-host flex-1 h-full min-h-0 min-w-0 overflow-hidden"
                    style={{ ["--tt-slot-min-height" as any]: `${slotMinHeightPx}px` }}
                >
                    {isPageLoading || (isolation.showManual && isLoadingManualTime) ? (
                        <CalendarSkeleton />
                    ) : pageError || (isolation.showManual && manualTimeError) ? (
                        <div className="flex items-center justify-center h-full w-full">
                            <div className="text-center">
                                <div className="text-red-400 text-xl mb-2">Error loading data</div>
                                <div className="text-gray-500">{toErrorString(pageError || manualTimeError)}</div>
                            </div>
                        </div>
                    ) : showFullCalendarGrid ? (
                    <FullCalendar
                        key={`calendar-${calendarStartHour}-${slotMinHeightPx}`}
                        height="100%"
                        expandRows={false}
                        stickyHeaderDates={false}
                        slotMinTime={slotMinTime}
                        slotMaxTime={slotMaxTime}
                        scrollTime={scrollTime}
                        ref={ref}
                        plugins={[timeGridPlugin, interactionPlugin]}
                        initialView="timeGridWeek"
                        initialDate={formatLocalDateYMD(weekStart)}
                        events={events}
                        eventClick={handleEventClick}
                        eventDidMount={(info) => {
                            const eventType = info.event.extendedProps?.type as string | undefined;
                            if (eventType !== "timeblock") return;
                            const handler = (e: globalThis.MouseEvent) => {
                                const apps = (info.event.extendedProps?.apps ?? []) as { app: string; appNames: string[]; totalDuration: number }[];
                                const appNames = Array.from(new Set(apps.flatMap((a) => a.appNames)));
                                if (appNames.length === 0) return;
                                onTimeBlockContextMenu?.(e, appNames);
                            };
                            info.el.addEventListener("contextmenu", handler);
                            (info.el as HTMLElement & { __ttContextMenuHandler?: (e: globalThis.MouseEvent) => void }).__ttContextMenuHandler = handler;
                        }}
                        eventWillUnmount={(info) => {
                            const el = info.el as HTMLElement & { __ttContextMenuHandler?: (e: globalThis.MouseEvent) => void };
                            const handler = el.__ttContextMenuHandler;
                            if (!handler) return;
                            info.el.removeEventListener("contextmenu", handler);
                            delete el.__ttContextMenuHandler;
                        }}
                        allDaySlot={false}
                        nowIndicator={true}
                        headerToolbar={false}
                        firstDay={1}
                        datesSet={onDatesSet}
                    />
                    ) : (
                        <div className="flex items-center justify-center h-full w-full">
                            <div className="text-center">
                                {isAuthExpired ? (
                                    <>
                                        <div className="text-red-400 text-2xl mb-3 font-semibold">
                                            Google Calendar session expired
                                        </div>
                                        <div className="text-gray-400 text-lg mb-6">
                                            Your Google login has expired. Re-connect to see your calendar events.
                                        </div>
                                        <button
                                            onClick={handleRelogin}
                                            disabled={isRelogging}
                                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-white font-semibold transition-colors"
                                        >
                                            {isRelogging ? "Connecting..." : "Re-connect Google Calendar"}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-gray-400 text-4xl mb-4 font-semibold">
                                            No data for this week
                                        </div>
                                        <div className="text-gray-600 text-xl">
                                            Start tracking to see your activity here
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
