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

const pillOn = "bg-slate-600 text-white shadow-sm ring-1 ring-white/10";
const pillOff = "bg-gray-950/80 text-gray-500 hover:bg-gray-800/90 hover:text-gray-300";

export type CalendarTogglePillsProps = {
    inCal: boolean;
    inStats: boolean;
    onToggleCal: () => void;
    onToggleStats: () => void;
    isLeftCollapsed: boolean;
    calLabel?: string;
    statsLabel?: string;
    fullWidth?: boolean;
};

export function CalendarTogglePills({
    inCal,
    inStats,
    onToggleCal,
    onToggleStats,
    isLeftCollapsed,
    calLabel = "Week",
    statsLabel = "Stats",
    fullWidth = true,
}: CalendarTogglePillsProps) {
    if (isLeftCollapsed) {
        return (
            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    aria-pressed={inCal}
                    aria-label="Show on week view"
                    title="Week view"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleCal();
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${inCal ? pillOn : pillOff}`}
                >
                    <IconWeekGrid className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    aria-pressed={inStats}
                    aria-label="Include in statistics"
                    title="Statistics"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleStats();
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${inStats ? pillOn : pillOff}`}
                >
                    <IconBarChart className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }

    const widthClass = fullWidth ? "w-full max-w-full" : "w-auto";

    return (
        <div className={`inline-flex ${widthClass} rounded-md border border-gray-700/90 bg-black/40 p-0.5 shadow-inner shrink-0`}>
            <button
                type="button"
                aria-pressed={inCal}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleCal();
                }}
                className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium leading-tight transition-all ${
                    inCal ? pillOn : pillOff
                }`}
            >
                <IconWeekGrid className="h-3.5 w-3.5 shrink-0 opacity-90" />
                <span className="truncate">{calLabel}</span>
            </button>
            <button
                type="button"
                aria-pressed={inStats}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleStats();
                }}
                className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium leading-tight transition-all ${
                    inStats ? pillOn : pillOff
                }`}
            >
                <IconBarChart className="h-3.5 w-3.5 shrink-0 opacity-90" />
                <span className="truncate">{statsLabel}</span>
            </button>
        </div>
    );
}

export type CalendarSourceTogglesProps = CalendarTogglePillsProps & {
    name: string;
    color: string;
};

export default function CalendarSourceToggles({
    name,
    color,
    inCal,
    inStats,
    onToggleCal,
    onToggleStats,
    isLeftCollapsed,
    calLabel,
    statsLabel,
}: CalendarSourceTogglesProps) {
    if (isLeftCollapsed) {
        return (
            <div className="flex flex-col items-center gap-1 py-1.5 rounded-lg hover:bg-gray-900/80">
                <div
                    className="h-2.5 w-2.5 shrink-0 rounded-sm border border-gray-600 ring-1 ring-black/20"
                    style={{ backgroundColor: color }}
                />
                <CalendarTogglePills
                    inCal={inCal}
                    inStats={inStats}
                    onToggleCal={onToggleCal}
                    onToggleStats={onToggleStats}
                    isLeftCollapsed={isLeftCollapsed}
                    calLabel={calLabel}
                    statsLabel={statsLabel}
                />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-[12px_1fr] gap-x-2 gap-y-1.5 rounded-lg border border-gray-800/80 bg-gray-950/30 px-2 py-2 transition-colors hover:border-gray-700/90">
            <div
                className="row-span-2 mt-0.5 h-3 w-3 shrink-0 self-start rounded-sm border border-gray-600 ring-1 ring-black/30"
                style={{ backgroundColor: color }}
            />
            <span className="min-w-0 truncate text-sm font-medium leading-tight text-gray-100">
                {name}
            </span>
            <div className="col-start-2 flex min-w-0">
                <CalendarTogglePills
                    inCal={inCal}
                    inStats={inStats}
                    onToggleCal={onToggleCal}
                    onToggleStats={onToggleStats}
                    isLeftCollapsed={false}
                    calLabel={calLabel}
                    statsLabel={statsLabel}
                />
            </div>
        </div>
    );
}
