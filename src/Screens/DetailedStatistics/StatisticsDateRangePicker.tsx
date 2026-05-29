import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PAD = 12;
const PANEL_WIDTH = 280;
const GAP = 8;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
] as const;

function formatDateInputValue(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function clampCalendarDate(date: Date, min: Date, max: Date): Date {
    const t = date.getTime();
    if (t < min.getTime()) return new Date(min);
    if (t > max.getTime()) return new Date(max);
    return new Date(date);
}

function sameCalendarDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function compareCalendarDay(a: Date, b: Date): number {
    const ay = a.getFullYear();
    const am = a.getMonth();
    const ad = a.getDate();
    const by = b.getFullYear();
    const bm = b.getMonth();
    const bd = b.getDate();
    if (ay !== by) return ay - by;
    if (am !== bm) return am - bm;
    return ad - bd;
}

function computeCalendarPanelStyle(trigger: DOMRect, alignRight: boolean): CSSProperties {
    let left = alignRight ? trigger.right - PANEL_WIDTH : trigger.left;
    if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_PAD) {
        left = window.innerWidth - VIEWPORT_PAD - PANEL_WIDTH;
    }
    if (left < VIEWPORT_PAD) {
        left = VIEWPORT_PAD;
    }

    const spaceBelow = window.innerHeight - trigger.bottom - VIEWPORT_PAD;
    const spaceAbove = trigger.top - VIEWPORT_PAD;
    const openBelow = spaceBelow >= 280 || spaceBelow >= spaceAbove;

    if (openBelow) {
        return {
            position: "fixed",
            left,
            top: trigger.bottom + GAP,
            width: PANEL_WIDTH,
            zIndex: 9999,
        };
    }

    return {
        position: "fixed",
        left,
        bottom: window.innerHeight - trigger.top + GAP,
        width: PANEL_WIDTH,
        zIndex: 9999,
    };
}

type OpenField = "start" | "end" | null;

type StatisticsDateRangePickerProps = {
    startDate: Date;
    endDate: Date;
    minDate: Date;
    maxDate: Date;
    onRangeChange: (start: Date, end: Date) => void;
    disabled?: boolean;
};

function CalendarIcon() {
    return (
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
        </svg>
    );
}

export default function StatisticsDateRangePicker({
    startDate,
    endDate,
    minDate,
    maxDate,
    onRangeChange,
    disabled = false,
}: StatisticsDateRangePickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const startTriggerRef = useRef<HTMLButtonElement>(null);
    const endTriggerRef = useRef<HTMLButtonElement>(null);
    const [openField, setOpenField] = useState<OpenField>(null);
    const [viewYear, setViewYear] = useState(startDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(startDate.getMonth());
    const [panelStyle, setPanelStyle] = useState<CSSProperties>({
        position: "fixed",
        visibility: "hidden",
    });

    const selectedDate = openField === "start" ? startDate : openField === "end" ? endDate : startDate;
    const alignRight = openField === "end";

    useLayoutEffect(() => {
        if (!openField) return;

        const update = () => {
            const trigger =
                openField === "end" ? endTriggerRef.current : startTriggerRef.current;
            if (!trigger) return;
            setPanelStyle({
                ...computeCalendarPanelStyle(trigger.getBoundingClientRect(), alignRight),
                visibility: "visible",
            });
        };

        update();
        const raf = requestAnimationFrame(update);
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [openField, alignRight, viewYear, viewMonth]);

    useEffect(() => {
        if (!openField) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenField(null);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [openField]);

    useEffect(() => {
        if (!openField) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpenField(null);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [openField]);

    const openPicker = (field: "start" | "end") => {
        if (disabled) return;
        const date = field === "start" ? startDate : endDate;
        setViewYear(date.getFullYear());
        setViewMonth(date.getMonth());
        setOpenField(field);
    };

    const handleDaySelect = (day: number) => {
        const picked = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
        const clamped = clampCalendarDate(picked, minDate, maxDate);
        if (openField === "start") {
            let nextStart = clamped;
            let nextEnd = endDate;
            if (compareCalendarDay(nextStart, nextEnd) > 0) {
                nextEnd = nextStart;
            }
            onRangeChange(nextStart, nextEnd);
        } else if (openField === "end") {
            let nextEnd = clamped;
            let nextStart = startDate;
            if (compareCalendarDay(nextEnd, nextStart) < 0) {
                nextStart = nextEnd;
            }
            onRangeChange(nextStart, nextEnd);
        }
        setOpenField(null);
    };

    const goMonth = (delta: number) => {
        const next = new Date(viewYear, viewMonth + delta, 1, 12, 0, 0, 0);
        setViewYear(next.getFullYear());
        setViewMonth(next.getMonth());
    };

    const monthStart = new Date(viewYear, viewMonth, 1, 12, 0, 0, 0);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0, 12, 0, 0, 0);
    const canGoPrev = compareCalendarDay(monthStart, minDate) > 0;
    const canGoNext = compareCalendarDay(monthEnd, maxDate) < 0;

    const firstWeekday = monthStart.getDay();
    const daysInMonth = monthEnd.getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const fieldButtonClass =
        "bg-transparent text-white text-sm py-0.5 px-1 rounded outline-none hover:bg-gray-700/60 focus:bg-gray-700/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0";

    const panel =
        openField &&
        createPortal(
            <div
                ref={panelRef}
                style={panelStyle}
                className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-3"
                role="dialog"
                aria-label={openField === "start" ? "Choose start date" : "Choose end date"}
            >
                <div className="flex items-center justify-between mb-3">
                    <button
                        type="button"
                        disabled={!canGoPrev}
                        onClick={() => goMonth(-1)}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded"
                        aria-label="Previous month"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="text-sm font-medium text-white">
                        {MONTH_NAMES[viewMonth]}, {viewYear}
                    </span>
                    <button
                        type="button"
                        disabled={!canGoNext}
                        onClick={() => goMonth(1)}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded"
                        aria-label="Next month"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {WEEKDAYS.map((label) => (
                        <div key={label} className="text-center text-xs text-gray-500 py-1">
                            {label}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((day, i) => {
                        if (day === null) {
                            return <div key={`empty-${i}`} />;
                        }
                        const date = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
                        const isDisabled =
                            compareCalendarDay(date, minDate) < 0 || compareCalendarDay(date, maxDate) > 0;
                        const isSelected = sameCalendarDay(date, selectedDate);
                        return (
                            <button
                                key={day}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => handleDaySelect(day)}
                                className={`h-8 text-sm rounded transition-colors ${
                                    isDisabled
                                        ? "text-gray-600 cursor-not-allowed"
                                        : isSelected
                                          ? "bg-white text-gray-900 font-medium"
                                          : "text-gray-200 hover:bg-gray-700"
                                }`}
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
            </div>,
            document.body
        );

    return (
        <div
            ref={containerRef}
            className={`flex items-center gap-1.5 bg-gray-800/80 border border-gray-700 rounded-lg px-2 py-1.5 min-w-0 ${disabled ? "opacity-50" : ""}`}
        >
            <button
                ref={startTriggerRef}
                type="button"
                disabled={disabled}
                onClick={() => openPicker("start")}
                className={`${fieldButtonClass} ${openField === "start" ? "bg-gray-700/60" : ""}`}
                aria-label="Range start date"
                aria-expanded={openField === "start"}
            >
                <span>{formatDateInputValue(startDate)}</span>
                <CalendarIcon />
            </button>
            <span className="text-gray-500 text-xs shrink-0">–</span>
            <button
                ref={endTriggerRef}
                type="button"
                disabled={disabled}
                onClick={() => openPicker("end")}
                className={`${fieldButtonClass} ${openField === "end" ? "bg-gray-700/60" : ""}`}
                aria-label="Range end date"
                aria-expanded={openField === "end"}
            >
                <span>{formatDateInputValue(endDate)}</span>
                <CalendarIcon />
            </button>
            {panel}
        </div>
    );
}

export function calendarDateFromUnix(dayStartUnix: number): Date {
    const d = new Date(dayStartUnix * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}
