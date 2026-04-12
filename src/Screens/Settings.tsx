import { useEffect, useRef, useState } from "react";
import { useToast } from "../Componants/Toast.tsx";
import {
    CALENDAR_HEIGHT_MAX,
    CALENDAR_HEIGHT_MIN,
    RIGHT_SIDEBAR_WIDTH_MAX,
    RIGHT_SIDEBAR_WIDTH_MIN,
    useSettingsStore,
    type TimeBlockSettings,
} from "../stores/settingsStore.ts";

function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
        e.currentTarget.blur();
    }
}

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

    const [calendarStartHourDraft, setCalendarStartHourDraft] = useState(() =>
        String(calendarStartHour)
    );
    const [calendarHeightDraft, setCalendarHeightDraft] = useState(() =>
        String(calendarHeight)
    );
    const [rightSidebarDraft, setRightSidebarDraft] = useState(() =>
        String(rightSidebarWidth)
    );
    const [categorySidebarDraft, setCategorySidebarDraft] = useState(() =>
        String(categorySidebarCount)
    );
    const [uiMinAppDurationDraft, setUiMinAppDurationDraft] = useState(() =>
        String(uiMinAppDuration)
    );
    const [tbDraft, setTbDraft] = useState(() => ({
        minLogDuration: String(timeBlockSettings.minLogDuration),
        maxAttachDistance: String(timeBlockSettings.maxAttachDistance),
        lookaheadWindow: String(timeBlockSettings.lookaheadWindow),
        minDuration: String(timeBlockSettings.minDuration),
    }));

    const tbFocusRef = useRef<null | keyof TimeBlockSettings>(null);

    useEffect(() => {
        setCalendarStartHourDraft(String(calendarStartHour));
    }, [calendarStartHour]);
    useEffect(() => {
        setCalendarHeightDraft(String(calendarHeight));
    }, [calendarHeight]);
    useEffect(() => {
        setRightSidebarDraft(String(rightSidebarWidth));
    }, [rightSidebarWidth]);
    useEffect(() => {
        setCategorySidebarDraft(String(categorySidebarCount));
    }, [categorySidebarCount]);
    useEffect(() => {
        setUiMinAppDurationDraft(String(uiMinAppDuration));
    }, [uiMinAppDuration]);
    useEffect(() => {
        setTbDraft((d) => ({
            minLogDuration:
                tbFocusRef.current === "minLogDuration"
                    ? d.minLogDuration
                    : String(timeBlockSettings.minLogDuration),
            maxAttachDistance:
                tbFocusRef.current === "maxAttachDistance"
                    ? d.maxAttachDistance
                    : String(timeBlockSettings.maxAttachDistance),
            lookaheadWindow:
                tbFocusRef.current === "lookaheadWindow"
                    ? d.lookaheadWindow
                    : String(timeBlockSettings.lookaheadWindow),
            minDuration:
                tbFocusRef.current === "minDuration"
                    ? d.minDuration
                    : String(timeBlockSettings.minDuration),
        }));
    }, [timeBlockSettings]);

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
                                step={1}
                                value={calendarStartHourDraft}
                                onChange={(e) => setCalendarStartHourDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    const t = calendarStartHourDraft.trim();
                                    const revert = () =>
                                        setCalendarStartHourDraft(String(calendarStartHour));
                                    if (t === "") {
                                        showToast("Start hour: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast("Start hour: not a valid number.", "error");
                                        revert();
                                        return;
                                    }
                                    const h = Math.trunc(n);
                                    if (h < 0 || h > 23) {
                                        showToast("Start hour: use 0–23.", "error");
                                        revert();
                                        return;
                                    }
                                    setCalendarStartHourDraft(String(h));
                                    if (h !== calendarStartHour) {
                                        setCalendarStartHour(h);
                                    }
                                }}
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Calendar size (%)</label>
                            <input
                                type="number"
                                step={1}
                                value={calendarHeightDraft}
                                onChange={(e) => setCalendarHeightDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
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
                                onKeyDown={blurOnEnter}
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
                                step={1}
                                value={categorySidebarDraft}
                                onChange={(e) => setCategorySidebarDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    const t = categorySidebarDraft.trim();
                                    const revert = () =>
                                        setCategorySidebarDraft(String(categorySidebarCount));
                                    if (t === "") {
                                        showToast("Categories count: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast("Categories count: not a valid number.", "error");
                                        revert();
                                        return;
                                    }
                                    const c = Math.trunc(n);
                                    if (c < 1 || c > 30) {
                                        showToast("Categories count: use 1–30.", "error");
                                        revert();
                                        return;
                                    }
                                    setCategorySidebarDraft(String(c));
                                    if (c !== categorySidebarCount) {
                                        setCategorySidebarCount(c);
                                    }
                                }}
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
                                step={1}
                                value={tbDraft.minLogDuration}
                                onFocus={() => {
                                    tbFocusRef.current = "minLogDuration";
                                }}
                                onChange={(e) =>
                                    setTbDraft((d) => ({ ...d, minLogDuration: e.target.value }))
                                }
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    tbFocusRef.current = null;
                                    const t = tbDraft.minLogDuration.trim();
                                    const revert = () =>
                                        setTbDraft((d) => ({
                                            ...d,
                                            minLogDuration: String(timeBlockSettings.minLogDuration),
                                        }));
                                    if (t === "") {
                                        showToast("Min log duration: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast("Min log duration: not a valid number.", "error");
                                        revert();
                                        return;
                                    }
                                    const v = Math.trunc(n);
                                    if (v < 1) {
                                        showToast("Min log duration: use at least 1.", "error");
                                        revert();
                                        return;
                                    }
                                    setTbDraft((d) => ({ ...d, minLogDuration: String(v) }));
                                    if (v !== timeBlockSettings.minLogDuration) {
                                        setTimeBlockSettings({ minLogDuration: v });
                                    }
                                }}
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Max attach distance (sec)</label>
                            <input
                                type="number"
                                step={1}
                                value={tbDraft.maxAttachDistance}
                                onFocus={() => {
                                    tbFocusRef.current = "maxAttachDistance";
                                }}
                                onChange={(e) =>
                                    setTbDraft((d) => ({ ...d, maxAttachDistance: e.target.value }))
                                }
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    tbFocusRef.current = null;
                                    const t = tbDraft.maxAttachDistance.trim();
                                    const revert = () =>
                                        setTbDraft((d) => ({
                                            ...d,
                                            maxAttachDistance: String(
                                                timeBlockSettings.maxAttachDistance
                                            ),
                                        }));
                                    if (t === "") {
                                        showToast("Max attach distance: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast(
                                            "Max attach distance: not a valid number.",
                                            "error"
                                        );
                                        revert();
                                        return;
                                    }
                                    const v = Math.trunc(n);
                                    if (v < 0) {
                                        showToast("Max attach distance: use 0 or more.", "error");
                                        revert();
                                        return;
                                    }
                                    setTbDraft((d) => ({ ...d, maxAttachDistance: String(v) }));
                                    if (v !== timeBlockSettings.maxAttachDistance) {
                                        setTimeBlockSettings({ maxAttachDistance: v });
                                    }
                                }}
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Lookahead window (sec)</label>
                            <input
                                type="number"
                                step={1}
                                value={tbDraft.lookaheadWindow}
                                onFocus={() => {
                                    tbFocusRef.current = "lookaheadWindow";
                                }}
                                onChange={(e) =>
                                    setTbDraft((d) => ({ ...d, lookaheadWindow: e.target.value }))
                                }
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    tbFocusRef.current = null;
                                    const t = tbDraft.lookaheadWindow.trim();
                                    const revert = () =>
                                        setTbDraft((d) => ({
                                            ...d,
                                            lookaheadWindow: String(timeBlockSettings.lookaheadWindow),
                                        }));
                                    if (t === "") {
                                        showToast("Lookahead window: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast("Lookahead window: not a valid number.", "error");
                                        revert();
                                        return;
                                    }
                                    const v = Math.trunc(n);
                                    if (v < 0) {
                                        showToast("Lookahead window: use 0 or more.", "error");
                                        revert();
                                        return;
                                    }
                                    setTbDraft((d) => ({ ...d, lookaheadWindow: String(v) }));
                                    if (v !== timeBlockSettings.lookaheadWindow) {
                                        setTimeBlockSettings({ lookaheadWindow: v });
                                    }
                                }}
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="text-sm text-gray-300">Min timeblock duration (sec)</label>
                            <input
                                type="number"
                                step={1}
                                value={tbDraft.minDuration}
                                onFocus={() => {
                                    tbFocusRef.current = "minDuration";
                                }}
                                onChange={(e) =>
                                    setTbDraft((d) => ({ ...d, minDuration: e.target.value }))
                                }
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    tbFocusRef.current = null;
                                    const t = tbDraft.minDuration.trim();
                                    const revert = () =>
                                        setTbDraft((d) => ({
                                            ...d,
                                            minDuration: String(timeBlockSettings.minDuration),
                                        }));
                                    if (t === "") {
                                        showToast("Min timeblock duration: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast(
                                            "Min timeblock duration: not a valid number.",
                                            "error"
                                        );
                                        revert();
                                        return;
                                    }
                                    const v = Math.trunc(n);
                                    if (v < 1) {
                                        showToast("Min timeblock duration: use at least 1.", "error");
                                        revert();
                                        return;
                                    }
                                    setTbDraft((d) => ({ ...d, minDuration: String(v) }));
                                    if (v !== timeBlockSettings.minDuration) {
                                        setTimeBlockSettings({ minDuration: v });
                                    }
                                }}
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
                                step={1}
                                value={uiMinAppDurationDraft}
                                onChange={(e) => setUiMinAppDurationDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    const t = uiMinAppDurationDraft.trim();
                                    const revert = () =>
                                        setUiMinAppDurationDraft(String(uiMinAppDuration));
                                    if (t === "") {
                                        showToast("Min app duration: enter a number.", "error");
                                        revert();
                                        return;
                                    }
                                    const n = Number(t);
                                    if (!Number.isFinite(n)) {
                                        showToast("Min app duration: not a valid number.", "error");
                                        revert();
                                        return;
                                    }
                                    const v = Math.trunc(n);
                                    if (v < 1) {
                                        showToast("Min app duration: use at least 1.", "error");
                                        revert();
                                        return;
                                    }
                                    setUiMinAppDurationDraft(String(v));
                                    if (v !== uiMinAppDuration) {
                                        setUiMinAppDuration(v);
                                    }
                                }}
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
