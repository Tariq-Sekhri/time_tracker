import { useMemo } from "react";
import { useSettingsStore } from "../stores/settingsStore.ts";

export default function Settings() {
    const {
        calendarStartHour,
        setCalendarStartHour,
        rightSidebarWidth,
        setRightSidebarWidth,
        timeBlockSettings,
        setTimeBlockSettings,
        uiMinAppDuration,
        setUiMinAppDuration,
        resetSettings,
    } = useSettingsStore();

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
                            <label className="text-sm text-gray-300">Right sidebar width (px)</label>
                            <input
                                type="number"
                                min={280}
                                max={800}
                                step={1}
                                value={rightSidebarWidth}
                                onChange={(e) => setRightSidebarWidth(Number(e.target.value))}
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

