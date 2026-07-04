import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../Componants/Toast.tsx";
import { useBackendSettings, type SettingField } from "../hooks/useBackendSettings.ts";
import {
    getDatabaseLocation,
    resetDatabaseLocation,
    setDatabaseLocation,
    type DatabaseLocationInfo,
} from "../api/databaseLocation.ts";
import { toErrorString } from "../types/common.ts";

type FieldDef = { key: string; label: string };
type CategoryDef = { title: string; fields: FieldDef[] };

const SETTINGS_LAYOUT: CategoryDef[] = [
    {
        title: "Calendar",
        fields: [
            { key: "calendarStartHour", label: "Start hour" },
            { key: "calendarHeight", label: "Calendar size (%)" },
            { key: "rightSidebarWidth", label: "Right sidebar width (px)" },
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
            </div>
        </div>
    );
}

export default function Settings() {
    const { showToast } = useToast();
    const { fields, allLocked, setVal, toggleLock, resetField, resetSettings } = useBackendSettings();

    const hasFields = useMemo(() => Object.keys(fields).length > 0, [fields]);

    return (
        <div className="p-6 text-white h-full overflow-y-auto nice-scrollbar">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <h1 className="text-2xl font-bold">Settings</h1>
                <button
                    type="button"
                    disabled={!hasFields || allLocked}
                    onClick={resetSettings}
                    title="Resets every unlocked setting to its default. Locked settings are left unchanged."
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white text-sm font-medium shrink-0 self-start sm:self-auto disabled:opacity-40 disabled:pointer-events-none"
                >
                    Reset
                </button>
            </div>

            <div className="space-y-6">
                <DatabaseLocationSetting />
                {SETTINGS_LAYOUT.map((category) => (
                    <div key={category.title} className="bg-gray-900 p-4 rounded">
                        <h2 className="text-lg font-semibold mb-4">{category.title}</h2>
                        <div className="space-y-3">
                            {category.fields.map((def) => (
                                <NumberSettingField
                                    key={def.key}
                                    label={def.label}
                                    field={fields[def.key]}
                                    onCommit={(value) => setVal(def.key, value)}
                                    onToggleLock={() => toggleLock(def.key)}
                                    onReset={() => resetField(def.key)}
                                    onInvalid={(message) => showToast(message, "error")}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
