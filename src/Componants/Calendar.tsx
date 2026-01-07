import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { get_week, TimeBlock } from "../api/week.ts";
import { unwrapResult } from "../utils.ts";
import { useState } from "react";
import { EventClickArg, DatesSetArg } from "@fullcalendar/core";

export default function Calendar() {
    const [date, setDate] = useState<Date>(() => new Date());
    const { data, isLoading, error } = useQuery({
        queryKey: ["week", date.toISOString()],
        queryFn: async () => unwrapResult(await get_week(date)),
        enabled: !!date && !isNaN(date.getTime()),
    });


    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error.message}</div>;
    }

    const events = (data || []).map((block: TimeBlock) => {
        const startMs = block.startTime * 1000;
        const endMs = block.endTime * 1000;

        const start = new Date(startMs);
        const end = new Date(endMs);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return null;
        }

        return {
            id: block.id.toString(),
            title: block.category,
            start: start.toISOString(),
            end: end.toISOString(),
            extendedProps: {
                apps: block.apps,
            },
        };
    }).filter((e): e is NonNullable<typeof e> => e !== null);

    if (events.length > 0) {
        const eventDays = new Set(events.map(e => new Date(e.start).toDateString()));
        console.log('Unique days with events:', Array.from(eventDays));
        if (eventDays.size === 1) {
            console.warn('⚠️ All events are on the same day! This might indicate a date conversion issue.');
        }
    }

    const handleEventClick = (clickInfo: EventClickArg) => {
        console.log("Event clicked:", {
            id: clickInfo.event.id,
            title: clickInfo.event.title,
            start: clickInfo.event.start,
            end: clickInfo.event.end,
            extendedProps: clickInfo.event.extendedProps,
            allDay: clickInfo.event.allDay,
        });
    };

    const handleDatesSet = (arg: DatesSetArg) => {
        const newDate = new Date(arg.start);
        if (!isNaN(newDate.getTime())) {
            setDate(newDate);
        }
    };

    return (
        <div className="p-4">
            <FullCalendar
                plugins={[timeGridPlugin]}
                initialView="timeGridWeek"
                initialDate={date}
                headerToolbar={{
                    right: "prev,next today",
                    center: "title",
                }}
                datesSet={handleDatesSet}
                editable={false}
                selectable={false}
                dayMaxEvents={true}
                events={events}
                height="auto"
                allDaySlot={false}
                eventDisplay="block"
                nowIndicator={true}
                timeZone="local"
                firstDay={1}
                eventClick={handleEventClick}
            />
        </div>
    );
}