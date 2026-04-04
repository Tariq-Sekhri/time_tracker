import "./App.css";
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

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

    useEffect(() => {
        let unlistenFn: (() => void) | null = null;
        let unlistenErr: (() => void) | null = null;
        let unlistenDownloading: (() => void) | null = null;
        let unlistenProgress: (() => void) | null = null;
        let unlistenInstalling: (() => void) | null = null;
        let unlistenInstalled: (() => void) | null = null;

        let updaterToastId: string | null = null;

        const setup = async () => {
            const unlisten = await listen("update-available", () => {
                setUpdateAvailable(true);
            });
            unlistenFn = unlisten;

            unlistenErr = await listen<string>("update-error", (e) => {
                const msg = typeof e.payload === "string" ? e.payload : toErrorString(e.payload);
                setUpdateError(msg);
                showToast("Update error", "error", 0, msg);
            });

            unlistenDownloading = await listen("update-downloading", () => {
                if (!updaterToastId) {
                    updaterToastId = showToast("Downloading update…", "loading", 0);
                } else {
                    updateToast(updaterToastId, "Downloading update…", "loading");
                }
            });

            unlistenProgress = await listen<{ downloaded: number; total: number }>(
                "update-download-progress",
                (e) => {
                    if (!updaterToastId) {
                        updaterToastId = showToast("Downloading update…", "loading", 0);
                    }
                    const downloaded = e.payload?.downloaded ?? 0;
                    const total = e.payload?.total ?? 0;
                    const pct = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
                    updateToast(
                        updaterToastId,
                        total > 0 ? `Downloading update… ${pct}%` : "Downloading update…",
                        "loading"
                    );
                }
            );

            unlistenInstalling = await listen("update-installing", () => {
                if (!updaterToastId) {
                    updaterToastId = showToast("Installing update…", "loading", 0);
                } else {
                    updateToast(updaterToastId, "Installing update…", "loading");
                }
            });

            unlistenInstalled = await listen("update-installed", () => {
                if (updaterToastId) {
                    updateToast(updaterToastId, "Update installed", "success");
                    const id = updaterToastId;
                    updaterToastId = null;
                    setTimeout(() => removeToast(id), 2000);
                } else {
                    showToast("Update installed", "success");
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
        };
    }, [showToast, updateToast, removeToast]);

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
