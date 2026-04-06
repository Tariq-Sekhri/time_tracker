import {isCurrentWeek} from "../utils.ts";

export default function CalanderHeader(props: {
    headerTitle: string,
    onClick: () => void,
    d: Date,
    onClick1: () => void,
    onClick2: () => void,
    calendarStartHour: number,
}) {
    return <div className="flex-shrink-0 p-4 border-b border-gray-700 bg-black">
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">{props.headerTitle}</h2>
            <div className="flex gap-2">
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