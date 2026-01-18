import {unwrapResult} from "../../utils.ts";
import {get_week, TimeBlock} from "../../api/week.ts";
import CalendarSkeleton from "./CalanderSkeletion.tsx";
import {useQuery} from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import {useEffect, useMemo} from "react";
import {getCategoryColor, getWeekStart} from "./utils.ts";
import {CalendarEvent, DateClickInfo, EventLogs} from "./types.ts";
import {Category} from "../../api/Category.ts";
import {EventClickArg, DatesSetArg} from "@fullcalendar/core";
import interactionPlugin from '@fullcalendar/interaction';
import {useDateStore} from "../../stores/dateStore.ts";

interface RenderCalendarContentProps {
    ref: any;
    date: Date;
    visibleCategories: Set<string>;
    categoryColorMap: Map<string, string>;
    categories: Category[];
    toggleCategory: (categoryName: string) => void;
    handleEventClick: (clickInfo: EventClickArg) => void;
    onDatesSet: (dates: DatesSetArg) => void;
}

export default function RenderCalendarContent({
                                                  ref,
                                                  date,
                                                  visibleCategories,
                                                  categoryColorMap,
                                                  categories,
                                                  toggleCategory,
                                                  handleEventClick,
                                                  onDatesSet,
                                              }: RenderCalendarContentProps) {
    // Use week start for consistent querying
    const weekStart = getWeekStart(date);
    const {data, isLoading, error} = useQuery({
        queryKey: ["week", weekStart.toISOString()],
        queryFn: async () => unwrapResult(await get_week(weekStart)),
        enabled: !!weekStart && !isNaN(weekStart.getTime()),
    });


    // Move all hooks to the top, before any conditional returns
    const events = useMemo(() => {
        if (!data) return [];

        return (data || [])
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

                return {
                    id: block.id.toString(),
                    title: block.category,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    backgroundColor: color,
                    borderColor: color,
                    textColor: "#ffffff",
                    extendedProps: {
                        apps: block.apps,
                    },
                };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null);
    }, [data, categoryColorMap, visibleCategories]);


    // Now handle conditional returns after all hooks
    if (isLoading) {
        return <CalendarSkeleton/>;
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

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full w-full">
                <div className="text-center">
                    <div className="text-gray-400 text-4xl mb-4 font-semibold">
                        No data for this week
                    </div>
                    <div className="text-gray-600 text-xl">
                        Start tracking to see your activity here
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 overflow-hidden">
            <div className="w-64 border-r border-gray-700 bg-black p-4 overflow-y-auto flex-shrink-0">
                <h3 className="text-lg font-semibold text-white mb-4">
                    Filter Categories
                </h3>
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
                                    style={{backgroundColor: color}}
                                />
                                <span className="text-sm text-gray-200 flex-1">
                                    {categoryName}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1">
                <FullCalendar
                    ref={ref}
                    plugins={[timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    initialDate={weekStart.toISOString().split('T')[0]}
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
    );
}