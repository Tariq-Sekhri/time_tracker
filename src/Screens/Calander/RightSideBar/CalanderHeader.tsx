import {isCurrentWeek} from "../utils.ts";
import CalendarAppFilterIndicator from "../../../Componants/CalendarAppFilterIndicator.tsx";
import {ReactNode} from "react";

export default function CalanderHeader(props: {
    headerTitle: string,
    onClick: () => void,
    d: Date,
    onClick1: () => void,
    onClick2: () => void,
    calendarStartHour: number,
    appJumpPrev?: () => void,
    appJumpNext?: () => void,
    appJumpPrevDisabled?: boolean,
    appJumpNextDisabled?: boolean,
    timerControl: ReactNode,
}) {
    return <div className="flex-shrink-0 border-b border-gray-800 bg-black px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">{props.headerTitle}</h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
                {props.timerControl}
                <div className="h-6 w-px bg-gray-800" aria-hidden="true" />
                <CalendarAppFilterIndicator
                    onPrev={props.appJumpPrev}
                    onNext={props.appJumpNext}
                    prevDisabled={props.appJumpPrevDisabled}
                    nextDisabled={props.appJumpNextDisabled}
                />
                <button
                    className="px-3 py-1 bg-gray-800 text-white rounded hover:bg-gray-700"
                    onClick={props.onClick}
                >
                    ‹
                </button>
                <button
                    className={`px-3 py-1 rounded ${isCurrentWeek(props.d, props.calendarStartHour)
                        ? "bg-gray-900 text-gray-600 cursor-not-allowed"
                        : "bg-gray-800 text-white hover:bg-gray-700"
                    }`}
                    onClick={props.onClick1}
                    disabled={isCurrentWeek(props.d, props.calendarStartHour)}
                >
                    ›
                </button>
                <button
                    className="px-3 py-1 bg-gray-800 text-white rounded hover:bg-gray-700"
                    onClick={props.onClick2}
                >
                    today
                </button>
            </div>
        </div>
    </div>;
}
