import "./App.css";
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useRef } from "react";

import Calendar from "./Screens/Calander/Calendar.tsx";
import CategoriesView from "./Componants/CategoriesView.tsx";
import CategoryRegexView from "./Screens/CategoryRegexView.tsx";
import SkippedAppsView from "./Screens/SkippedAppsView.tsx";
import DetailedStatistics from "./Screens/DetailedStatistics.tsx";
import AppsList from "./Screens/AppsList.tsx";
import Header from "./Componants/Header.tsx";
import GoogleCalendarsView from "./Screens/GoogleCalendarsView.tsx";
import Settings from "./Screens/Settings.tsx";
import { ToastProvider, useToast } from "./Componants/Toast.tsx";
import CalendarAppFilterIndicator from "./Componants/CalendarAppFilterIndicator.tsx";
import { toErrorString } from "./types/common.ts";

export type View =
    | "calendar"
    | "categories"
    | "regex"
    | "skipped"
    | "detailed"
    | "apps"
    | "googleCalendars"
    | "settings";

function AppInner() {
    const { showToast, updateToast, removeToast } = useToast();
    const [currentView, setCurrentView] = useState<View>("calendar");
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const lastDownloadPctRef = useRef<number | null>(null);
    const didShowUnknownDownloadRef = useRef(false);
    const showToastRef = useRef(showToast);
    const updateToastRef = useRef(updateToast);
    const removeToastRef = useRef(removeToast);

    useEffect(() => {
        showToastRef.current = showToast;
        updateToastRef.current = updateToast;
        removeToastRef.current = removeToast;
    }, [showToast, updateToast, removeToast]);

    useEffect(() => {
        let unlistenFn: (() => void) | null = null;
        let unlistenErr: (() => void) | null = null;
        let unlistenDownloading: (() => void) | null = null;
        let unlistenProgress: (() => void) | null = null;
        let unlistenInstalling: (() => void) | null = null;
        let unlistenInstalled: (() => void) | null = null;
        let unknownDownloadAnimTimer: ReturnType<typeof setInterval> | null = null;
        let unknownDownloadAnimStep = 0;

        let updaterToastId: string | null = null;
        const startUnknownDownloadAnim = () => {
            if (!updaterToastId) return;
            if (unknownDownloadAnimTimer) return;
            unknownDownloadAnimStep = 0;
            unknownDownloadAnimTimer = setInterval(() => {
                if (!updaterToastId) return;
                const dots = ".".repeat((unknownDownloadAnimStep % 3) + 1);
                unknownDownloadAnimStep += 1;
                updateToastRef.current(updaterToastId, `Downloading${dots}`, "loading");
            }, 500);
        };
        const stopUnknownDownloadAnim = () => {
            if (!unknownDownloadAnimTimer) return;
            clearInterval(unknownDownloadAnimTimer);
            unknownDownloadAnimTimer = null;
        };

        const setup = async () => {
            const unlisten = await listen("update-available", () => {
                setUpdateAvailable(true);
            });
            unlistenFn = unlisten;

            unlistenErr = await listen<string>("update-error", (e) => {
                const msg = typeof e.payload === "string" ? e.payload : toErrorString(e.payload);
                setUpdateError(msg);
                showToastRef.current("Update error", "error", 0, msg);
            });

            unlistenDownloading = await listen("update-downloading", () => {
                if (!updaterToastId) {
                    updaterToastId = showToastRef.current("Downloading update…", "loading", 0);
                } else {
                    updateToastRef.current(updaterToastId, "Downloading update…", "loading");
                }
                didShowUnknownDownloadRef.current = true;
                startUnknownDownloadAnim();
            });

            unlistenProgress = await listen<{ downloaded: number; total: number }>(
                "update-download-progress",
                (e) => {
                    if (!updaterToastId) {
                        updaterToastId = showToastRef.current("Downloading update…", "loading", 0);
                    }
                    const downloaded = e.payload?.downloaded ?? 0;
                    const total = e.payload?.total ?? 0;
                    if (total <= 0 || downloaded <= 0) {
                        if (!didShowUnknownDownloadRef.current) {
                            didShowUnknownDownloadRef.current = true;
                        }
                        startUnknownDownloadAnim();
                        return;
                    }
                    stopUnknownDownloadAnim();
                    const pct = Math.floor((downloaded / total) * 100);
                    if (lastDownloadPctRef.current === pct) {
                        return;
                    }
                    lastDownloadPctRef.current = pct;
                    didShowUnknownDownloadRef.current = false;
                    updateToastRef.current(
                        updaterToastId,
                        `Downloading update… ${pct}%`,
                        "loading"
                    );
                }
            );

            unlistenInstalling = await listen("update-installing", () => {
                stopUnknownDownloadAnim();
                if (!updaterToastId) {
                    updaterToastId = showToastRef.current("Installing update…", "loading", 0);
                } else {
                    updateToastRef.current(updaterToastId, "Installing update…", "loading");
                }
            });

            unlistenInstalled = await listen("update-installed", () => {
                stopUnknownDownloadAnim();
                if (updaterToastId) {
                    updateToastRef.current(updaterToastId, "Update installed", "success");
                    const id = updaterToastId;
                    updaterToastId = null;
                    lastDownloadPctRef.current = null;
                    didShowUnknownDownloadRef.current = false;
                    setTimeout(() => removeToastRef.current(id), 2000);
                } else {
                    showToastRef.current("Update installed", "success");
                }
            });
        };

        setup();

        return () => {
            if (unlistenFn) unlistenFn();
            if (unlistenErr) unlistenErr();
            if (unlistenDownloading) unlistenDownloading();
            if (unlistenProgress) unlistenProgress();
            if (unlistenInstalling) unlistenInstalling();
            if (unlistenInstalled) unlistenInstalled();
            stopUnknownDownloadAnim();
        };
    }, []);

    useEffect(() => {
        const onError = (e: Event) => {
            const anyE = e as any;
            const msg = anyE?.error ? toErrorString(anyE.error) : anyE?.message ? String(anyE.message) : "Unknown error";
            showToast("Unexpected error", "error", 0, msg);
        };

        const onUnhandledRejection = (e: PromiseRejectionEvent) => {
            const msg = toErrorString(e.reason);
            showToast("Unexpected error", "error", 0, msg);
        };

        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onUnhandledRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onUnhandledRejection);
        };
    }, [showToast]);

    const applyUpdate = async () => {
        setUpdateError(null);
        setIsUpdating(true);
        try {
            await invoke("apply_update_cmd");
        } catch (e) {
            setUpdateError(String(e));
            setIsUpdating(false);
        }
    };

    return (
        <main className="bg-black text-white h-screen flex flex-col">
            <Header currentView={currentView} setCurrentView={setCurrentView} />

            {updateAvailable && (
                <div className="border-b border-gray-700 bg-gray-900 px-4 py-3 flex items-center gap-3">
                    <div className="flex-1">
                        <div className="font-medium">Update available</div>
                        <div className="text-sm text-gray-300">
                            {updateError ? updateError : "Install the latest version now."}
                        </div>
                    </div>
                    <button
                        onClick={() => setUpdateAvailable(false)}
                        disabled={isUpdating}
                        className="px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-60"
                    >
                        Later
                    </button>
                    <button
                        onClick={applyUpdate}
                        disabled={isUpdating}
                        className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                    >
                        {isUpdating ? "Updating..." : "Update now"}
                    </button>
                </div>
            )}

            <div
                className={
                    currentView === "calendar"
                        ? "flex-1 min-h-0 overflow-hidden flex flex-col nice-scrollbar"
                        : "flex-1 min-h-0 overflow-auto nice-scrollbar"
                }
            >
                {currentView === "calendar" && <Calendar setCurrentView={setCurrentView} />}
                {currentView === "categories" && <CategoriesView />}
                {currentView === "regex" && <CategoryRegexView />}
                {currentView === "skipped" && <SkippedAppsView />}
                {currentView === "detailed" && (<DetailedStatistics
                    onBack={() => setCurrentView("calendar")}
                />
                )}
                {currentView === "apps" && (
                    <AppsList
                        onBack={() => setCurrentView("calendar")}
                    />
                )}
                {currentView === "settings" && <Settings />}
                {currentView === "googleCalendars" && <GoogleCalendarsView />}
            </div>
            <CalendarAppFilterIndicator />
        </main>
    );
}

export default function App() {
    return (
        <ToastProvider>
            <AppInner />
        </ToastProvider>
    );
}
