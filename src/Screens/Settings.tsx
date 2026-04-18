import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "../Componants/Toast.tsx";
import {
    CALENDAR_HEIGHT_MAX,
    CALENDAR_HEIGHT_MIN,
    RIGHT_SIDEBAR_WIDTH_MAX,
    RIGHT_SIDEBAR_WIDTH_MIN,
    useSettingsStore,
    type SettingsFieldKey,
    type TimeBlockSettings,
} from "../stores/settingsStore.ts";

function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
        e.currentTarget.blur();
    }
}

function IconLockClosed({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M16.5 10.5V6.75C16.5 4.26472 14.4853 2.25 12 2.25C9.51472 2.25 7.5 4.26472 7.5 6.75V10.5M6.75 21.75H17.25C18.4926 21.75 19.5 20.7426 19.5 19.5V12.75C19.5 11.5074 18.4926 10.5 17.25 10.5H6.75C5.50736 10.5 4.5 11.5074 4.5 12.75V19.5C4.5 20.7426 5.50736 21.75 6.75 21.75Z" />
        </svg>
    );
}

function IconLockOpen({ className }: { className?: string }) {
    return (
        <svg
            className={[className, "overflow-visible"].filter(Boolean).join(" ")}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
        >
            <g
                transform="translate(3 0)"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M13.5 10.5V6.75C13.5 4.26472 15.5147 2.25 18 2.25C20.4853 2.25 22.5 4.26472 22.5 6.75V10.5M3.75 21.75H14.25C15.4926 21.75 16.5 20.7426 16.5 19.5V12.75C16.5 11.5074 15.4926 10.5 14.25 10.5H3.75C2.50736 10.5 1.5 11.5074 1.5 12.75V19.5C1.5 20.7426 2.50736 21.75 3.75 21.75Z" />
            </g>
        </svg>
    );
}

function IconReset({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
        </svg>
    );
}

function FieldLockReset({
    locked,
    onToggleLock,
    onReset,
}: {
    locked: boolean;
    onToggleLock: () => void;
    onReset: () => void;
}) {
    return (
        <span className="inline-flex items-center gap-2 shrink-0">
            <button
                type="button"
                onClick={onToggleLock}
                className="overflow-visible p-1.5 rounded text-gray-300 hover:bg-gray-800 hover:text-white"
                title={locked ? "Unlock" : "Lock"}
            >
                {locked ? <IconLockClosed className="w-4 h-4" /> : <IconLockOpen className="w-4 h-4" />}
            </button>
            <button
                type="button"
                disabled={locked}
                onClick={onReset}
                className="p-1.5 rounded text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                title="Reset to default"
            >
                <IconReset className="w-4 h-4" />
            </button>
        </span>
    );
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
        fieldLocks,
        toggleFieldLock,
        resetField,
        resetSettings,
    } = useSettingsStore();

    const allFieldsLocked = useMemo(
        () => (Object.values(fieldLocks) as boolean[]).every(Boolean),
        [fieldLocks]
    );

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

    const pendingDraftsRef = useRef({
        calendarStartHourDraft,
        calendarHeightDraft,
        rightSidebarDraft,
        categorySidebarDraft,
        uiMinAppDurationDraft,
        tbDraft,
    });
    pendingDraftsRef.current = {
        calendarStartHourDraft,
        calendarHeightDraft,
        rightSidebarDraft,
        categorySidebarDraft,
        uiMinAppDurationDraft,
        tbDraft,
    };

    useLayoutEffect(() => {
        return () => {
            const d = pendingDraftsRef.current;
            const st = useSettingsStore.getState();
            const L = st.fieldLocks;

            if (!L.calendarStartHour) {
                const t = d.calendarStartHourDraft.trim();
                if (t !== "") {
                    const n = Number(t);
                    if (Number.isFinite(n)) {
                        const h = Math.trunc(n);
                        if (h >= 0 && h <= 23 && h !== st.calendarStartHour) {
                            st.setCalendarStartHour(h);
                        }
                    }
                }
            }
            if (!L.calendarHeight) {
                const t = d.calendarHeightDraft.trim();
                if (t !== "") {
                    const n = Number(t);
                    if (Number.isFinite(n)) {
                        const h = Math.trunc(n);
                        if (
                            h >= CALENDAR_HEIGHT_MIN &&
                            h <= CALENDAR_HEIGHT_MAX &&
                            h !== st.calendarHeight
                        ) {
                            st.setCalendarHeight(h);
                        }
                    }
                }
            }
            if (!L.rightSidebarWidth) {
                const t = d.rightSidebarDraft.trim();
                if (t !== "") {
                    const n = Number(t);
                    if (Number.isFinite(n)) {
                        const w = Math.trunc(n);
                        if (
                            w >= RIGHT_SIDEBAR_WIDTH_MIN &&
                            w <= RIGHT_SIDEBAR_WIDTH_MAX &&
                            w !== st.rightSidebarWidth
                        ) {
                            st.setRightSidebarWidth(w);
                        }
                    }
                }
            }
            if (!L.categorySidebarCount) {
                const t = d.categorySidebarDraft.trim();
                if (t !== "") {
                    const n = Number(t);
                    if (Number.isFinite(n)) {
                        const c = Math.trunc(n);
                        if (c >= 1 && c <= 30 && c !== st.categorySidebarCount) {
                            st.setCategorySidebarCount(c);
                        }
                    }
                }
            }
            if (!L.uiMinAppDuration) {
                const t = d.uiMinAppDurationDraft.trim();
                if (t !== "") {
                    const n = Number(t);
                    if (Number.isFinite(n)) {
                        const v = Math.trunc(n);
                        if (v >= 1 && v !== st.uiMinAppDuration) {
                            st.setUiMinAppDuration(v);
                        }
                    }
                }
            }
            {
                const tb = st.timeBlockSettings;
                const patch: Partial<TimeBlockSettings> = {};
                if (!L.minLogDuration) {
                    const t = d.tbDraft.minLogDuration.trim();
                    if (t !== "") {
                        const n = Number(t);
                        if (Number.isFinite(n)) {
                            const v = Math.trunc(n);
                            if (v >= 1 && v !== tb.minLogDuration) patch.minLogDuration = v;
                        }
                    }
                }
                if (!L.maxAttachDistance) {
                    const t = d.tbDraft.maxAttachDistance.trim();
                    if (t !== "") {
                        const n = Number(t);
                        if (Number.isFinite(n)) {
                            const v = Math.trunc(n);
                            if (v >= 0 && v !== tb.maxAttachDistance) patch.maxAttachDistance = v;
                        }
                    }
                }
                if (!L.lookaheadWindow) {
                    const t = d.tbDraft.lookaheadWindow.trim();
                    if (t !== "") {
                        const n = Number(t);
                        if (Number.isFinite(n)) {
                            const v = Math.trunc(n);
                            if (v >= 0 && v !== tb.lookaheadWindow) patch.lookaheadWindow = v;
                        }
                    }
                }
                if (!L.minDuration) {
                    const t = d.tbDraft.minDuration.trim();
                    if (t !== "") {
                        const n = Number(t);
                        if (Number.isFinite(n)) {
                            const v = Math.trunc(n);
                            if (v >= 1 && v !== tb.minDuration) patch.minDuration = v;
                        }
                    }
                }
                if (Object.keys(patch).length > 0) {
                    st.setTimeBlockSettings(patch);
                }
            }
        };
    }, []);

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

    const row = (key: SettingsFieldKey, label: string, control: ReactNode) => (
        <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-300 truncate min-w-0 flex-1">{label}</span>
            <div className="flex items-center gap-2 shrink-0">
                <FieldLockReset
                    locked={fieldLocks[key]}
                    onToggleLock={() => toggleFieldLock(key)}
                    onReset={() => resetField(key)}
                />
                {control}
            </div>
        </div>
    );

    return (
        <div className="p-6 text-white h-full overflow-y-auto nice-scrollbar">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <h1 className="text-2xl font-bold">Settings</h1>
                <button
                    type="button"
                    disabled={allFieldsLocked}
                    onClick={resetSettings}
                    title="Resets every unlocked setting to its default. Locked settings are left unchanged."
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm font-medium shrink-0 self-start sm:self-auto disabled:opacity-40 disabled:pointer-events-none"
                >
                    Reset
                </button>
            </div>

            <div className="space-y-6">
                <div className="bg-gray-900 p-4 rounded">
                    <h2 className="text-lg font-semibold mb-4">Calendar</h2>

                    <div className="space-y-3">
                        {row(
                            "calendarStartHour",
                            "Start hour",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.calendarStartHour}
                                value={calendarStartHourDraft}
                                onChange={(e) => setCalendarStartHourDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    if (fieldLocks.calendarStartHour) return;
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
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}

                        {row(
                            "calendarHeight",
                            "Calendar size (%)",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.calendarHeight}
                                value={calendarHeightDraft}
                                onChange={(e) => setCalendarHeightDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    if (fieldLocks.calendarHeight) return;
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
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}

                        {row(
                            "rightSidebarWidth",
                            "Right sidebar width (px)",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.rightSidebarWidth}
                                value={rightSidebarDraft}
                                onChange={(e) => setRightSidebarDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    if (fieldLocks.rightSidebarWidth) return;
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
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}

                        {row(
                            "categorySidebarCount",
                            "Categories in stats sidebar",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.categorySidebarCount}
                                value={categorySidebarDraft}
                                onChange={(e) => setCategorySidebarDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    if (fieldLocks.categorySidebarCount) return;
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
                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}
                    </div>
                </div>

                <div className="bg-gray-900 p-4 rounded">
                    <h2 className="text-lg font-semibold mb-4">Timeblock detection (advanced)</h2>

                    <div className="space-y-3">
                        {row(
                            "minLogDuration",
                            "Min log duration (sec)",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.minLogDuration}
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
                                    if (fieldLocks.minLogDuration) return;
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
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}

                        {row(
                            "maxAttachDistance",
                            "Max attach distance (sec)",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.maxAttachDistance}
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
                                    if (fieldLocks.maxAttachDistance) return;
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
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}

                        {row(
                            "lookaheadWindow",
                            "Lookahead window (sec)",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.lookaheadWindow}
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
                                    if (fieldLocks.lookaheadWindow) return;
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
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}

                        {row(
                            "minDuration",
                            "Min timeblock duration (sec)",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.minDuration}
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
                                    if (fieldLocks.minDuration) return;
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
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}
                    </div>
                </div>

                <div className="bg-gray-900 p-4 rounded">
                    <h2 className="text-lg font-semibold mb-4">UI filters</h2>

                    <div className="space-y-3">
                        {row(
                            "uiMinAppDuration",
                            "Min app duration (sec)",
                            <input
                                type="number"
                                step={1}
                                disabled={fieldLocks.uiMinAppDuration}
                                value={uiMinAppDurationDraft}
                                onChange={(e) => setUiMinAppDurationDraft(e.target.value)}
                                onKeyDown={blurOnEnter}
                                onBlur={() => {
                                    if (fieldLocks.uiMinAppDuration) return;
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
                                className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
