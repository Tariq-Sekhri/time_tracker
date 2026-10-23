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
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 xl:grid-cols-[minmax(12rem,1fr)_minmax(0,56rem)_minmax(12rem,1fr)]">
            <h2 className="text-xl font-semibold text-white">{props.headerTitle}</h2>
            <div className="order-last col-span-2 mx-auto w-full max-w-4xl min-w-0 xl:order-none xl:col-span-1">
                {props.timerControl}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
