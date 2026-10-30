import "./Settings.css";
import ThemeSettings from "../theme/ThemeSettings";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../Componants/Toast.tsx";
import { useBackendSettings, type SettingField } from "../hooks/useBackendSettings.ts";
import {
    getDatabaseLocation,
    replaceBetaDatabase,
    resetDatabaseLocation,
    setDatabaseLocation,
    type DatabaseLocationInfo,
} from "../api/databaseLocation.ts";
import { toErrorString } from "../types/common.ts";
import { useNotesState } from "../hooks/useNotesState.ts";
import {getSupportLogInfo, openSupportLogFolder, isDesktopApp, type SupportLogInfo} from "../diagnostics.ts";
import AfkSettings from "../Componants/AfkSettings.tsx";

const DataTransfer = lazy(() => import("../dataTransfer/ui/DataTransfer.tsx"));

type FieldDef = { key: string; label: string };
type CategoryDef = { title: string; fields: FieldDef[] };

const SETTINGS_LAYOUT: CategoryDef[] = [
    {
        title: "Calendar",
        fields: [
            { key: "calendarStartHour", label: "Start hour" },
            { key: "calendarHeight", label: "Calendar size (%)" },
            { key: "categorySidebarCount", label: "Categories in stats sidebar" },
        ],
    },
    {
        title: "Timeblock detection (advanced)",
        fields: [
            { key: "minLogDuration", label: "Min log duration (sec)" },
            { key: "maxAttachDistance", label: "Max attach distance (sec)" },
            { key: "lookaheadWindow", label: "Lookahead window (sec)" },
            { key: "minDuration", label: "Min timeblock duration (sec)" },
        ],
    },
    {
        title: "UI filters",
        fields: [{ key: "uiMinAppDuration", label: "Min app duration (sec)" }],
    },
];

function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
        e.currentTarget.blur();
    }
}

function rangeMessage(label: string, min: number | null, max: number | null): string {
    if (min != null && max != null) return `${label}: use ${min}–${max}.`;
    if (min != null) return `${label}: use ${min} or more.`;
    if (max != null) return `${label}: use ${max} or less.`;
    return `${label}: enter a valid number.`;
}

type ParseResult = { ok: true; value: number } | { ok: false; message: string };

function parseFieldValue(label: string, raw: string, min: number | null, max: number | null): ParseResult {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: false, message: `${label}: enter a number.` };
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { ok: false, message: `${label}: not a valid number.` };
    const value = Math.trunc(n);
    if ((min != null && value < min) || (max != null && value > max)) {
        return { ok: false, message: rangeMessage(label, min, max) };
    }
    return { ok: true, value };
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

function NumberSettingField({
    label,
    field,
    onCommit,
    onToggleLock,
    onReset,
    onInvalid,
}: {
    label: string;
    field: SettingField | undefined;
    onCommit: (value: number) => void;
    onToggleLock: () => void;
    onReset: () => void;
    onInvalid: (message: string) => void;
}) {
    const locked = field?.isLocked ?? true;
    const value = field?.val;
    const min = field?.min ?? null;
    const max = field?.max ?? null;

    const [draft, setDraft] = useState(() => (value != null ? String(value) : ""));
    const focusedRef = useRef(false);

    useEffect(() => {
        if (!focusedRef.current && value != null) {
            setDraft(String(value));
        }
    }, [value]);

    const commitRef = useRef(onCommit);
    commitRef.current = onCommit;
    const stateRef = useRef({ draft, value, min, max, locked });
    stateRef.current = { draft, value, min, max, locked };

    useEffect(() => {
        return () => {
            const s = stateRef.current;
            if (s.locked || s.value == null) return;
            const parsed = parseFieldValue(label, s.draft, s.min, s.max);
            if (parsed.ok && parsed.value !== s.value) {
                commitRef.current(parsed.value);
            }
        };
    }, [label]);

    const handleBlur = () => {
        focusedRef.current = false;
        if (locked || value == null) return;
        const parsed = parseFieldValue(label, draft, min, max);
        if (!parsed.ok) {
            onInvalid(parsed.message);
            setDraft(String(value));
            return;
        }
        setDraft(String(parsed.value));
        if (parsed.value !== value) {
            onCommit(parsed.value);
        }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-300 truncate min-w-0 flex-1">{label}</span>
            <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onToggleLock}
                        disabled={!field}
                        className="overflow-visible p-1.5 rounded text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                        title={locked ? "Unlock" : "Lock"}
                    >
                        {locked ? <IconLockClosed className="w-4 h-4" /> : <IconLockOpen className="w-4 h-4" />}
                    </button>
                    <button
                        type="button"
                        disabled={locked || !field}
                        onClick={onReset}
                        className="p-1.5 rounded text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                        title="Reset to default"
                    >
                        <IconReset className="w-4 h-4" />
                    </button>
                </span>
                <input
                    type="number"
                    step={1}
                    disabled={locked || !field}
                    value={draft}
                    onFocus={() => {
                        focusedRef.current = true;
                    }}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={blurOnEnter}
                    onBlur={handleBlur}
                    className="w-28 px-2 py-1 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
                />
            </div>
        </div>
    );
}

function SupportLogsSetting() {
    const {showToast} = useToast();
    const toastRef = useRef(showToast);
    toastRef.current = showToast;
    const [info, setInfo] = useState<SupportLogInfo | null>(null);
    useEffect(() => {
        let active = true;
        getSupportLogInfo().then((result) => { if (active) setInfo(result); }).catch((error) => {
            if (active) toastRef.current("Could not load log location", "error", 5000, toErrorString(error));
        });
        return () => { active = false; };
    }, []);
    return <div className="bg-gray-900 p-4 rounded space-y-3">
        <h2 className="text-lg font-semibold">Support logs</h2>
        <p className="text-sm text-gray-400">If the app crashes, send the most recent log file from the time of the crash. Each launch creates one file with all activity and errors.</p>
        {info?.available === false && <p className="text-sm text-red-400">Logging could not start. Check that the log folder is writable.</p>}
        {info?.path && <p className="text-xs text-gray-400 font-mono break-all">Current log: {info.path}</p>}
        <button type="button" className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm" onClick={() => {
            void openSupportLogFolder().catch((error) => showToast("Could not open log folder", "error", 5000, toErrorString(error)));
        }}>Open log folder</button>
    </div>;
}

function DatabaseLocationSetting() {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [info, setInfo] = useState<DatabaseLocationInfo | null>(null);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getDatabaseLocation()
            .then((location) => {
                setInfo(location);
                setDraft(location.path);
            })
            .catch((e) => showToast("Failed to load database location", "error", 5000, toErrorString(e)));
    }, [showToast]);

    const applyLocation = async (path: string) => {
        setBusy(true);
        try {
            let result = await setDatabaseLocation(path, false);
            if (result.status === "needs_overwrite_confirmation") {
                const confirmed = window.confirm(
                    `The file at:\n\n${result.path}\n\nexists but is not a valid SQLite database.\n\nReplace it with a new empty database? This cannot be undone.`
                );
                if (!confirmed) return;
                result = await setDatabaseLocation(path, true);
                if (result.status !== "ok") return;
            }
            const next = await getDatabaseLocation();
            setInfo(next);
            setDraft(next.path);
            await queryClient.invalidateQueries();
            showToast("Database location updated", "success");
        } catch (e) {
            showToast("Failed to update database location", "error", 5000, toErrorString(e));
        } finally {
            setBusy(false);
        }
    };

    const handleApply = () => {
        const path = draft.trim();
        if (!path) {
            showToast("Enter a database file path", "error");
            return;
        }
        if (info && path === info.path) return;
        void applyLocation(path);
    };

    const handleReset = async () => {
        if (!info?.is_custom) return;
        setBusy(true);
        try {
            const next = await resetDatabaseLocation();
            setInfo(next);
            setDraft(next.path);
            await queryClient.invalidateQueries();
            showToast("Database location reset to default", "success");
        } catch (e) {
            showToast("Failed to reset database location", "error", 5000, toErrorString(e));
        } finally {
            setBusy(false);
        }
    };

    const handleReplaceBetaDatabase = async () => {
        if (!window.confirm("Replace Beta's data with a copy from Time Tracker? Beta will restart.")) return;
        setBusy(true);
        try {
            await replaceBetaDatabase();
        } catch (e) {
            showToast("Failed to copy Time Tracker's data", "error", 5000, toErrorString(e));
            setBusy(false);
        }
    };

    return (
        <div className="bg-gray-900 p-4 rounded">
            <h2 className="text-lg font-semibold mb-1">Data</h2>
            <p className="text-sm text-gray-400 mb-4">
                Point the app at a different SQLite file. Existing valid databases are used as-is; nothing is copied over.
            </p>
            <div className="space-y-3">
                <div className="flex flex-col gap-2">
                    <span className="text-sm text-gray-300">Database file</span>
                    <input
                        type="text"
                        value={draft}
                        disabled={busy || !info}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.currentTarget.blur();
                                handleApply();
                            }
                        }}
                        className="w-full px-2 py-1.5 bg-gray-800 text-white rounded text-sm font-mono disabled:opacity-50"
                        spellCheck={false}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={busy || !info || draft.trim() === (info?.path ?? "")}
                        onClick={handleApply}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
                    >
                        Apply
                    </button>
                    <button
                        type="button"
                        disabled={busy || !info?.is_custom}
                        onClick={() => void handleReset()}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
                    >
                        Use default
                    </button>
                </div>
                {info && (
                    <p className="text-xs text-gray-500 font-mono break-all">
                        Default: {info.default_path}
                    </p>
                )}
                {info?.is_beta && (
                    <div className="pt-3 border-t border-gray-800">
                        <p className="text-sm text-gray-400 mb-2">
                            Replace Beta's data with a fresh copy from Time Tracker. Time Tracker's own data isn't changed. Beta restarts, and its current data is saved in its backups folder.
                        </p>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleReplaceBetaDatabase()}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
                        >
                            Replace with Time Tracker data
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function Settings() {
    const { showToast } = useToast();
    const { fields, allLocked, setVal, toggleLock, resetField, resetSettings } = useBackendSettings();
    // Dev mode reuses the Notes flag and also unlocks the unfinished Import & export tab.
    const { enabled: devMode, setEnabled: setDevMode } = useNotesState();

    const [section, setSection] = useState("general");
    const pageRef = useRef<HTMLDivElement>(null);
    const sections = [
        {id: "general", label: "General"},
        {id: "tracking", label: "Tracking"},
        ...(isDesktopApp() ? [...(devMode ? [{id: "transfer", label: "Import & export"}] : []), {id: "data", label: "Data & support"}] : []),
    ];
    const selectSection = (id: string) => {
        setSection(id);
        if (pageRef.current) pageRef.current.scrollTop = 0;
        document.getElementById("settings-tab-" + id)?.focus();
    };
    const hasFields = useMemo(() => Object.keys(fields).length > 0, [fields]);

    const renderFields = (category: CategoryDef) => <div className="settings-field-grid">
        {category.fields.map(def => <NumberSettingField key={def.key} label={def.label} field={fields[def.key]}
            onCommit={value => setVal(def.key, value)} onToggleLock={() => toggleLock(def.key)}
            onReset={() => resetField(def.key)} onInvalid={message => showToast(message, "error")} />)}
    </div>;

    return <div className="settings-shell">
        <div className="theme-header shrink-0 border-b border-gray-700">
            <nav className="flex min-w-0 items-center justify-start overflow-x-auto border-t border-gray-800/70 bg-gray-950/60 px-5 py-2 nice-scrollbar sm:justify-center" aria-label="Settings sections">
                <div className={`grid w-full max-w-[760px] shrink-0 ${sections.length === 4 ? "min-w-[520px] grid-cols-4" : sections.length === 3 ? "min-w-[390px] grid-cols-3" : "min-w-[200px] grid-cols-2"}`} role="tablist" aria-label="Settings sections"
                    onKeyDown={event => {
                        if ((event.target as HTMLElement).getAttribute("role") !== "tab") return;
                        const index = sections.findIndex(item => item.id === section);
                        let next: number;
                        if (event.key === "ArrowRight") next = (index + 1) % sections.length;
                        else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
                        else if (event.key === "Home") next = 0;
                        else if (event.key === "End") next = sections.length - 1;
                        else return;
                        event.preventDefault();
                        selectSection(sections[next].id);
                    }}>
                    {sections.map(item => <button key={item.id} type="button" role="tab" id={"settings-tab-" + item.id}
                        className={`w-full border-b-2 px-4 py-3 text-center text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${section === item.id
                            ? "border-blue-400 text-blue-200"
                            : "border-transparent text-gray-500 hover:text-gray-300"
                        }`}
                        aria-selected={section === item.id} aria-controls={"settings-section-" + item.id}
                        tabIndex={section === item.id ? 0 : -1} onClick={() => selectSection(item.id)}>{item.label}</button>)}
                </div>
            </nav>
        </div>
        <div ref={pageRef} className="settings-page nice-scrollbar">
            <div className="settings-content">
                <div className="settings-section-stack" role="tabpanel" id="settings-section-general" aria-labelledby="settings-tab-general" hidden={section !== "general"}>
                    <ThemeSettings />

                    <section className="settings-panel" aria-labelledby="calendar-settings-title">
                        <div className="settings-section-heading"><div><h2 id="calendar-settings-title">Calendar</h2><p>Layout and sidebar.</p></div></div>
                        {renderFields(SETTINGS_LAYOUT[0])}
                    </section>

                    <section className="settings-panel" aria-labelledby="display-settings-title">
                        <div className="settings-section-heading"><div><h2 id="display-settings-title">Display</h2><p>Keep the interface focused.</p></div></div>
                        <div className="settings-field-grid">
                            <label className="settings-toggle-row"><span>Dev mode</span><input type="checkbox" checked={devMode}
                                onChange={event => {void setDevMode(event.target.checked).catch(error => showToast("Could not update dev mode", "error", 5000, toErrorString(error)));}}
                                aria-label="Enable dev mode" /></label>
                            {renderFields(SETTINGS_LAYOUT[2])}
                        </div>
                    </section>

                </div>

                <div className="settings-section-stack" role="tabpanel" id="settings-section-tracking" aria-labelledby="settings-tab-tracking" hidden={section !== "tracking"}>
                    <details className="settings-panel settings-disclosure">
                        <summary><span><strong>Timeblock detection</strong><span className="settings-summary-note">Activity and AFK grouping rules</span></span></summary>
                        <p className="text-sm text-gray-400">These rules also group AFK periods when Include AFK is enabled. Grouping stays separate for each device and does not change recorded evidence or the exact time hidden by the AFK filter.</p>
                        <div className="settings-disclosure-content">{renderFields(SETTINGS_LAYOUT[1])}</div>
                    </details>

                    <AfkSettings />
                </div>

                {isDesktopApp() && devMode && <div className="settings-section-stack" role="tabpanel" id="settings-section-transfer" aria-labelledby="settings-tab-transfer" hidden={section !== "transfer"}>
                    {section === "transfer" && <Suspense fallback={<p className="settings-muted" role="status">Loading import &amp; export?</p>}><DataTransfer /></Suspense>}
                </div>}
                {isDesktopApp() && <div className="settings-section-stack" role="tabpanel" id="settings-section-data" aria-labelledby="settings-tab-data" hidden={section !== "data"}>
                    <section className="settings-panel" aria-label="Data and support">
                        <div className="settings-section-heading"><div><h2>Data &amp; support</h2><p>Database location and diagnostic logs.</p></div></div>
                        <div className="space-y-4"><DatabaseLocationSetting /><SupportLogsSetting /></div>
                    </section>
                </div>}
                {(section === "general" || section === "tracking") && <div className="settings-view-actions">
                    <button type="button" disabled={!hasFields || allLocked} onClick={resetSettings}
                        title="Resets unlocked calendar, display, and timeblock settings. AFK settings have their own reset."
                        className="settings-secondary-button">Reset view settings</button>
                </div>}
            </div>
        </div>
    </div>;
}
