import { toErrorString } from "../../types/common.ts";
import { get_week, TimeBlock } from "../../api/week.ts";
import CalendarSkeleton from "./CalanderSkeletion.tsx";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCategoryColor, getWeekStart, formatDuration, formatLocalDateYMD } from "./utils.ts";
import { CalendarEvent, DateClickInfo, EventLogs } from "./types.ts";
import { Category } from "../../api/Category.ts";
import { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import interactionPlugin from '@fullcalendar/interaction';
import { useDateStore } from "../../stores/dateStore.ts";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import {
    get_all_google_calendar_events,
    google_oauth_login,
    GoogleCalendarEvent,
    GoogleCalendar,
    isGoogleCalendarEventExcludedFromTimeStats,
} from "../../api/GoogleCalendar.ts";
import { getWeekRange } from "../../utils.ts";
import { getCachedEvents, setCachedEvents } from "../../stores/googleCalendarCache.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../Componants/Toast.tsx";

function IconWeekGrid({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M3 10h18" />
            <path d="M9 4v18" />
        </svg>
    );
}

function IconBarChart({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
            <path d="M12 20V10" />
            <path d="M18 20V4" />
            <path d="M6 20v-4" />
        </svg>
    );
}

interface RenderCalendarContentProps {
    ref: any;
    date: Date;
    visibleCategories: Set<string>;
    categoryColorMap: Map<string, string>;
    categories: Category[];
    toggleCategory: (categoryName: string) => void;
    checkAllCategories: () => void;
    uncheckAllCategories: () => void;
    handleEventClick: (clickInfo: EventClickArg) => void;
    onDatesSet: (dates: DatesSetArg) => void;
    googleCalendarMap: Map<number, GoogleCalendar>;
    googleCalendars: GoogleCalendar[];
    visibleCalendars: Set<number>;
    toggleCalendar: (calendarId: number) => void;
    calendarsInStats: Set<number>;
    toggleCalendarInStats: (calendarId: number) => void;
    includeGoogleInStats: boolean;
    setIncludeGoogleInStats: (v: boolean) => void;
}

export default function RenderCalendarContent({
    ref,
    date,
    visibleCategories,
    categoryColorMap,
    categories,
    toggleCategory,
    checkAllCategories,
    uncheckAllCategories,
    handleEventClick,
    onDatesSet,
    googleCalendarMap,
    googleCalendars,
    visibleCalendars,
    toggleCalendar,
    calendarsInStats,
    toggleCalendarInStats,
    includeGoogleInStats,
    setIncludeGoogleInStats,
}: RenderCalendarContentProps) {
    const queryClient = useQueryClient();
    const { showToast, updateToast, removeToast } = useToast();
    const lastGoogleEventsErrorToastRef = useRef<string | null>(null);
    const calendarHostRef = useRef<HTMLDivElement>(null);
    const [isRelogging, setIsRelogging] = useState(false);
    const LEFT_SIDEBAR_COLLAPSED_KEY = "time-tracker:left-sidebar-collapsed";
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(() => {
        try {
            return localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_KEY) === "1";
        } catch {
            return false;
        }
    });

    const { calendarStartHour, calendarHeight, timeBlockSettings } = useSettingsStore();
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
    const { data, isLoading, error } = useQuery({
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
        enabled: !!weekStart && !isNaN(weekStart.getTime()),
        refetchOnWindowFocus: true, // Refetch when window gains focus
    });

    const weekRange = useMemo(
        () => getWeekRange(date, calendarStartHour),
        [date, calendarStartHour]
    );
    const calendarIds = useMemo(() => googleCalendars.map(cal => cal.id).sort().join(','), [googleCalendars]);
    
    const queryEnabled = !!weekStart && !isNaN(weekStart.getTime()) && googleCalendars.length > 0;
    console.log("[GCal Render] query setup:", {
        weekStart: weekRange.week_start,
        weekEnd: weekRange.week_end,
        calendarIds,
        googleCalendarsCount: googleCalendars.length,
        visibleCalendarsCount: visibleCalendars.size,
        visibleCalendarIds: [...visibleCalendars],
        queryEnabled,
    });

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
        queryFn: async () => {
            console.log("[GCal Render] queryFn executing: fetching events for range", weekRange.week_start, "-", weekRange.week_end);
            const data = await get_all_google_calendar_events(weekRange.week_start, weekRange.week_end);
            console.log("[GCal Render] queryFn result:", data.length, "events");
            return data;
        },
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
        console.log("[GCal Render] state update:", {
            googleCalendarEvents: googleCalendarEvents?.length ?? "null",
            isLoadingGoogleEvents,
            isGoogleEventsError,
            displayGoogleEventsCount: displayGoogleEvents.length,
            isShowingCachedEvents,
            cachedEventsCount: cachedEvents?.length ?? "null",
        });
    }, [googleCalendarEvents, isLoadingGoogleEvents, isGoogleEventsError, displayGoogleEvents, isShowingCachedEvents, cachedEvents]);

    useEffect(() => {
        try {
            localStorage.setItem(LEFT_SIDEBAR_COLLAPSED_KEY, isLeftCollapsed ? "1" : "0");
        } catch {
        }
    }, [isLeftCollapsed]);

    const events = useMemo(() => {
        const timeBlockEvents = (data || [])
            .filter((block: TimeBlock) => visibleCategories.has(block.category))
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

                const blockDurationSec = block.endTime - block.startTime;
                return {
                    id: `timeblock-${block.id}`,
                    title: `${block.category} (${formatDuration(blockDurationSec)})`,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    backgroundColor: color,
                    borderColor: color,
                    textColor: "#ffffff",
                    extendedProps: {
                        apps: block.apps,
                        type: "timeblock",
                        timeBlockId: block.id,
                        category: block.category,
                    },
                };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null);

        const googleEvents = displayGoogleEvents
            .filter((event: GoogleCalendarEvent) => visibleCalendars.has(event.calendar_id))
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
                const color = calendar?.color || "#4285f4"; // Default to Google blue if calendar not found
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
            }).filter((e): e is NonNullable<typeof e> => e !== null);

        const allEvents = [...timeBlockEvents, ...googleEvents];

        return allEvents;
    }, [data, categoryColorMap, visibleCategories, displayGoogleEvents, visibleCalendars, googleCalendarMap]);

    const showFullCalendarGrid = useMemo(() => {
        if (isLoading || (isLoadingGoogleEvents && !(cachedEvents?.length ?? 0))) return false;
        if (error) return false;
        const hasTimeBlocks = data && data.length > 0;
        const hasGoogleEvents =
            displayGoogleEvents.length > 0 &&
            displayGoogleEvents.some((event: GoogleCalendarEvent) => visibleCalendars.has(event.calendar_id));
        return !!(hasTimeBlocks || hasGoogleEvents);
    }, [isLoading, isLoadingGoogleEvents, cachedEvents, error, data, displayGoogleEvents, visibleCalendars]);

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
                } catch {
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
            } catch {
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

    if (isLoading || (isLoadingGoogleEvents && !(cachedEvents?.length ?? 0))) {
        return <CalendarSkeleton />;
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="text-red-400 text-xl mb-2">Error loading data</div>
                    <div className="text-gray-500">{error.message}</div>
                </div>
            </div>
        );
    }

    const hasTimeBlocks = data && data.length > 0;
    const hasGoogleEvents = displayGoogleEvents.length > 0 &&
        displayGoogleEvents.some((event: GoogleCalendarEvent) => visibleCalendars.has(event.calendar_id));
    const hasAnyEvents = hasTimeBlocks || hasGoogleEvents;

    if (!hasAnyEvents) {
        return (
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
        );
    }

    return (
        <div className="flex flex-1 overflow-hidden h-full min-h-0 flex flex-col">
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
                <div
                    className={`border-r border-gray-700 bg-black overflow-y-auto overflow-x-hidden nice-scrollbar flex-shrink-0 transition-all duration-200 ease-in-out ${isLeftCollapsed ? "w-16 p-2" : "w-64 p-4"}`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-lg font-semibold text-white ${isLeftCollapsed ? "hidden" : ""}`}>
                            Filter Categories
                        </h3>
                        <button
                            type="button"
                            onClick={() => setIsLeftCollapsed((v) => !v)}
                            className="shrink-0 px-2 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
                            aria-label={isLeftCollapsed ? "Expand filter sidebar" : "Collapse filter sidebar"}
                        >
                            {isLeftCollapsed ? "»" : "«"}
                        </button>
                    </div>
                    <div className={`flex gap-2 mb-4 ${isLeftCollapsed ? "hidden" : ""}`}>
                        <button
                            onClick={checkAllCategories}
                            className="flex-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                        >
                            Check All
                        </button>
                        <button
                            onClick={uncheckAllCategories}
                            className="flex-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-white transition-colors"
                        >
                            Uncheck All
                        </button>
                    </div>
                    <div className="space-y-2">
                        {categories.map((category) => {
                            const categoryName = category.name;
                            const isVisible = visibleCategories.has(categoryName);
                            const dbColor = categoryColorMap.get(categoryName);
                            const color = getCategoryColor(categoryName, dbColor);

                            return (
                                <label
                                    key={category.id}
                                    className="flex items-center gap-3 p-2 rounded hover:bg-gray-900 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isVisible}
                                        onChange={() => toggleCategory(categoryName)}
                                        className="w-4 h-4 rounded cursor-pointer"
                                    />
                                    <div
                                        className="w-4 h-4 rounded border border-gray-600"
                                        style={{ backgroundColor: color }}
                                    />
                                    <span className={`text-sm text-gray-200 flex-1 ${isLeftCollapsed ? "hidden" : ""}`}>
                                        {categoryName}
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    <div className="border-t border-gray-700 my-4"></div>

                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-lg font-semibold text-white ${isLeftCollapsed ? "hidden" : ""}`}>
                                Google Calendars
                            </h3>
                        </div>
                        <p className={`text-xs text-gray-500 mb-3 ${isLeftCollapsed ? "hidden" : ""}`}>
                            Overlay on the week view; optionally merge into the stats panel.
                        </p>
                        <label
                            className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-900/80 cursor-pointer border border-transparent hover:border-gray-800 ${isLeftCollapsed ? "hidden" : ""}`}
                        >
                            <input
                                type="checkbox"
                                checked={includeGoogleInStats}
                                onChange={(e) => setIncludeGoogleInStats(e.target.checked)}
                                className="w-4 h-4 rounded cursor-pointer accent-blue-600"
                            />
                            <span className="text-sm text-gray-200 flex-1 leading-snug">
                                Merge Google events into week statistics
                            </span>
                        </label>

                        <div className={`space-y-1 ${isLeftCollapsed ? "space-y-0" : ""}`}>
                            {googleCalendars.map((calendar) => {
                                const isVisible = visibleCalendars.has(calendar.id);
                                const inStats = calendarsInStats.has(calendar.id);

                                const pillOn =
                                    "bg-slate-600 text-white shadow-sm ring-1 ring-white/10";
                                const pillOff =
                                    "bg-gray-950/80 text-gray-500 hover:bg-gray-800/90 hover:text-gray-300";

                                if (isLeftCollapsed) {
                                    return (
                                        <div
                                            key={calendar.id}
                                            className="flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-gray-900/80"
                                        >
                                            <div
                                                className="h-2.5 w-2.5 shrink-0 rounded-sm border border-gray-600 ring-1 ring-black/20"
                                                style={{ backgroundColor: calendar.color }}
                                            />
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    type="button"
                                                    aria-pressed={isVisible}
                                                    aria-label="Show on week view"
                                                    title="Week view"
                                                    onClick={() => toggleCalendar(calendar.id)}
                                                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${isVisible ? pillOn : pillOff}`}
                                                >
                                                    <IconWeekGrid className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={inStats}
                                                    aria-label="Include in statistics"
                                                    title="Statistics"
                                                    onClick={() => toggleCalendarInStats(calendar.id)}
                                                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${inStats ? pillOn : pillOff}`}
                                                >
                                                    <IconBarChart className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={calendar.id}
                                        className="grid grid-cols-[12px_1fr] gap-x-2.5 gap-y-2 rounded-lg border border-gray-800/80 bg-gray-950/30 p-2.5 transition-colors hover:border-gray-700/90"
                                    >
                                        <div
                                            className="row-span-2 mt-0.5 h-3 w-3 shrink-0 self-start rounded-sm border border-gray-600 ring-1 ring-black/30"
                                            style={{ backgroundColor: calendar.color }}
                                        />
                                        <span className="min-w-0 truncate text-sm font-medium leading-tight text-gray-100">
                                            {calendar.name}
                                        </span>
                                        <div className="col-start-2 flex min-w-0">
                                            <div className="inline-flex w-full max-w-full rounded-lg border border-gray-700/90 bg-black/40 p-0.5 shadow-inner">
                                                <button
                                                    type="button"
                                                    aria-pressed={isVisible}
                                                    onClick={() => toggleCalendar(calendar.id)}
                                                    className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all sm:justify-start sm:px-2.5 ${
                                                        isVisible ? pillOn : pillOff
                                                    }`}
                                                >
                                                    <IconWeekGrid className="h-3.5 w-3.5 shrink-0 opacity-90" />
                                                    <span className="truncate">Week</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={inStats}
                                                    onClick={() => toggleCalendarInStats(calendar.id)}
                                                    className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all sm:justify-start sm:px-2.5 ${
                                                        inStats ? pillOn : pillOff
                                                    }`}
                                                >
                                                    <IconBarChart className="h-3.5 w-3.5 shrink-0 opacity-90" />
                                                    <span className="truncate">Stats</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {googleCalendars.length === 0 && (
                                <p className="text-sm text-gray-500">No calendars added</p>
                            )}
                        </div>
                    </div>
                </div>
                <div
                    ref={calendarHostRef}
                    className="calendar-fc-host flex-1 h-full min-h-0 min-w-0 overflow-hidden"
                    style={{ ["--tt-slot-min-height" as any]: `${slotMinHeightPx}px` }}
                >
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
                        allDaySlot={false}
                        nowIndicator={true}
                        headerToolbar={false}
                        firstDay={1}
                        datesSet={onDatesSet}
                    />
                </div>
            </div>

        </div>
    );
}