function formatDateInputValue(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseDateInputValue(value: string): Date | null {
    const parts = value.split("-");
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const date = new Date(y, m - 1, d, 12, 0, 0, 0);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
}

function clampCalendarDate(date: Date, min: Date, max: Date): Date {
    const t = date.getTime();
    if (t < min.getTime()) return new Date(min);
    if (t > max.getTime()) return new Date(max);
    return new Date(date);
}

const dateInputClass =
    "bg-transparent text-white text-sm w-[7.25rem] min-w-0 py-0.5 px-1 rounded outline-none focus:bg-gray-700/60 [color-scheme:dark] disabled:opacity-40 disabled:cursor-not-allowed";

type StatisticsDateRangePickerProps = {
    startDate: Date;
    endDate: Date;
    minDate: Date;
    maxDate: Date;
    onRangeChange: (start: Date, end: Date) => void;
    disabled?: boolean;
};

export default function StatisticsDateRangePicker({
    startDate,
    endDate,
    minDate,
    maxDate,
    onRangeChange,
    disabled = false,
}: StatisticsDateRangePickerProps) {
    const minValue = formatDateInputValue(minDate);
    const maxValue = formatDateInputValue(maxDate);

    const handleStartChange = (value: string) => {
        const parsed = parseDateInputValue(value);
        if (!parsed) return;
        let nextStart = clampCalendarDate(parsed, minDate, maxDate);
        let nextEnd = endDate;
        if (nextStart.getTime() > nextEnd.getTime()) {
            nextEnd = nextStart;
        }
        onRangeChange(nextStart, nextEnd);
    };

    const handleEndChange = (value: string) => {
        const parsed = parseDateInputValue(value);
        if (!parsed) return;
        let nextEnd = clampCalendarDate(parsed, minDate, maxDate);
        let nextStart = startDate;
        if (nextEnd.getTime() < nextStart.getTime()) {
            nextStart = nextEnd;
        }
        onRangeChange(nextStart, nextEnd);
    };

    return (
        <div
            className={`flex items-center gap-1.5 bg-gray-800/80 border border-gray-700 rounded-lg px-2 py-1.5 min-w-0 ${disabled ? "opacity-50" : ""}`}
        >
            <input
                type="date"
                value={formatDateInputValue(startDate)}
                min={minValue}
                max={maxValue}
                disabled={disabled}
                onChange={(e) => handleStartChange(e.target.value)}
                className={dateInputClass}
                aria-label="Range start date"
            />
            <span className="text-gray-500 text-xs shrink-0">–</span>
            <input
                type="date"
                value={formatDateInputValue(endDate)}
                min={minValue}
                max={maxValue}
                disabled={disabled}
                onChange={(e) => handleEndChange(e.target.value)}
                className={dateInputClass}
                aria-label="Range end date"
            />
        </div>
    );
}

export function calendarDateFromUnix(dayStartUnix: number): Date {
    const d = new Date(dayStartUnix * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}
