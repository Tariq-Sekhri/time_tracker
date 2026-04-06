import { useEffect, useMemo, useState } from "react";
import { useToast } from "../Componants/Toast.tsx";
import {
    CALENDAR_HEIGHT_MAX,
    CALENDAR_HEIGHT_MIN,
    RIGHT_SIDEBAR_WIDTH_MAX,
    RIGHT_SIDEBAR_WIDTH_MIN,
    useSettingsStore,
} from "../stores/settingsStore.ts";

export default function Settings() {
    const { showToast } = useToast();
    const {
        calendarStartHour,
        setCalendarStartHour,
        calendarHeight,
        setCalendarHeight,
        rightSidebarWidth,
        setRightSidebarWidth,
        timeBlockSettings,
        setTimeBlockSettings,
        uiMinAppDuration,
        setUiMinAppDuration,
        categorySidebarCount,
        setCategorySidebarCount,
        resetSettings,
    } = useSettingsStore();

    const [rightSidebarDraft, setRightSidebarDraft] = useState(() =>
        String(rightSidebarWidth)
    );
    const [calendarHeightDraft, setCalendarHeightDraft] = useState(() =>
        String(calendarHeight)
    );

    useEffect(() => {
        setRightSidebarDraft(String(rightSidebarWidth));
    }, [rightSidebarWidth]);
    useEffect(() => {
        setCalendarHeightDraft(String(calendarHeight));
    }, [calendarHeight]);

    const windowEndHour = useMemo(() => calendarStartHour + 24, [calendarStartHour]);
    const windowText = useMemo(() => {
        const start = String(calendarStartHour).padStart(2, "0");
        const end = String(windowEndHour).padStart(2, "0");
        return `${start}:00 to ${end}:00`;
    }, [calendarStartHour, windowEndHour]);

    return (
        <div className="p-6 text-white h-full overflow-y-auto nice-scrollbar">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Settings</h1>
                <button
                    onClick={resetSettings}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm font-medium"
                >
                    Reset
                </button>
            </div>

            <div className="space-y-6">
                <div className="bg-gray-900 p-4 rounded">
                    <h2 className="text-lg font-semibold mb-4">Calendar</h2>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Start hour</label>
                            <input
                                type="number"
                                min={0}
                                max={23}
                                step={1}
                                value={calendarStartHour}
                                onChange={(e) => setCalendarStartHour(Number(e.target.value))}
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="text-sm text-gray-400">
                            24-hour window: {windowText}
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Calendar size (%)</label>
                            <input
                                type="number"
                                step={1}
                                value={calendarHeightDraft}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setCalendarHeightDraft(value);
                                    const n = Number(value);
                                    if (!Number.isFinite(n)) {
                                        return;
                                    }
                                    const h = Math.trunc(n);
                                    if (h < CALENDAR_HEIGHT_MIN || h > CALENDAR_HEIGHT_MAX) {
                                        return;
                                    }
                                    if (h !== calendarHeight) {
                                        setCalendarHeight(h);
                                    }
                                }}
                                onBlur={() => {
                                    const t = calendarHeightDraft.trim();
                                    const revert = () =>
                                        setCalendarHeightDraft(String(calendarHeight));
                                    if (t === "") {
                                        showToast("Calendar height: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast("Calendar height: not a valid number.", "error");
                                        revert();
                                        return;
                                    }
                                    const h = Math.trunc(n);
                                    if (h < CALENDAR_HEIGHT_MIN || h > CALENDAR_HEIGHT_MAX) {
                                        showToast(
                                            `Calendar size: use ${CALENDAR_HEIGHT_MIN}-${CALENDAR_HEIGHT_MAX}%.`,
                                            "error"
                                        );
                                        revert();
                                        return;
                                    }
                                    setCalendarHeightDraft(String(h));
                                    if (h !== calendarHeight) {
                                        setCalendarHeight(h);
                                    }
                                }}
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Right sidebar width (px)</label>
                            <input
                                type="number"
                                step={1}
                                value={rightSidebarDraft}
                                onChange={(e) => setRightSidebarDraft(e.target.value)}
                                onBlur={() => {
                                    const t = rightSidebarDraft.trim();
                                    const revert = () =>
                                        setRightSidebarDraft(String(rightSidebarWidth));
                                    if (t === "") {
                                        showToast("Sidebar width: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast("Sidebar width: not a valid number.", "error");
                                        revert();
                                        return;
                                    }
                                    const w = Math.trunc(n);
                                    if (w < RIGHT_SIDEBAR_WIDTH_MIN || w > RIGHT_SIDEBAR_WIDTH_MAX) {
                                        showToast(
                                            `Sidebar width: use ${RIGHT_SIDEBAR_WIDTH_MIN}–${RIGHT_SIDEBAR_WIDTH_MAX} px.`,
                                            "error"
                                        );
                                        revert();
                                        return;
                                    }
                                    setRightSidebarDraft(String(w));
                                    if (w !== rightSidebarWidth) {
                                        setRightSidebarWidth(w);
                                    }
                                }}
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Categories in stats sidebar</label>
                            <input
                                type="number"
                                min={1}
                                max={30}
                                step={1}
                                value={categorySidebarCount}
                                onChange={(e) => setCategorySidebarCount(Number(e.target.value))}
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-900 p-4 rounded">
                    <h2 className="text-lg font-semibold mb-4">Timeblock detection (advanced)</h2>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Min log duration (sec)</label>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={timeBlockSettings.minLogDuration}
                                onChange={(e) =>
                                    setTimeBlockSettings({ minLogDuration: Number(e.target.value) })
                                }
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Max attach distance (sec)</label>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={timeBlockSettings.maxAttachDistance}
                                onChange={(e) =>
                                    setTimeBlockSettings({ maxAttachDistance: Number(e.target.value) })
                                }
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Lookahead window (sec)</label>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={timeBlockSettings.lookaheadWindow}
                                onChange={(e) =>
                                    setTimeBlockSettings({ lookaheadWindow: Number(e.target.value) })
                                }
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Min timeblock duration (sec)</label>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={timeBlockSettings.minDuration}
                                onChange={(e) =>
                                    setTimeBlockSettings({ minDuration: Number(e.target.value) })
                                }
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-900 p-4 rounded">
                    <h2 className="text-lg font-semibold mb-4">UI filters</h2>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Min app duration (sec)</label>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={uiMinAppDuration}
                                onChange={(e) => setUiMinAppDuration(Number(e.target.value))}
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="text-sm text-gray-400">
                            Apps shorter than {uiMinAppDuration} sec are filtered out.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

