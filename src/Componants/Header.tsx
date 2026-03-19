import { invoke } from "@tauri-apps/api/core";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { View } from "../App.tsx"


export default function Header({ currentView, setCurrentView }: {
    currentView: View,
    setCurrentView: (newView: View) => void,
}) {
    const [isTracking, setIsTracking] = useState(true);
    const [appVersion, setAppVersion] = useState<string | null>(null);
    const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "upToDate" | "available" | "error" | "applying">("idle");
    useEffect(() => {
        invoke<boolean>("get_tracking_status").then(setIsTracking);
    }, []);

    useEffect(() => {
        invoke<string>("get_app_version").then(setAppVersion).catch(() => setAppVersion(null));
    }, []);



    useEffect(() => {
        let unlistenFn: (() => void) | null = null;

        const setupListener = async () => {
            const unlisten = await listen<boolean>("tracking-status-changed", (event) => {
                setIsTracking(event.payload);
            });
            unlistenFn = unlisten;
        };

        setupListener();

        return () => {
            if (unlistenFn) {
                unlistenFn();
            }
        };
    }, []);

    const toggleTracking = async () => {
        const newStatus = !isTracking;
        setIsTracking(newStatus);
        await invoke("set_tracking_status", { isTracking: newStatus });
        await invoke("refresh_tray_menu_cmd");
    };

    const checkForUpdates = async () => {
        if (updateStatus === "checking" || updateStatus === "applying") return;
        setUpdateStatus("checking");
        try {
            const hasUpdate = await invoke<boolean>("check_update_cmd");
            if (hasUpdate) {
                setUpdateStatus("available");
            } else {
                setUpdateStatus("upToDate");
                window.setTimeout(() => setUpdateStatus("idle"), 1200);
            }
        } catch {
            setUpdateStatus("error");
            window.setTimeout(() => setUpdateStatus("idle"), 1500);
        }
    };

    const applyUpdate = async () => {
        if (updateStatus === "checking" || updateStatus === "applying") return;
        setUpdateStatus("applying");
        try {
            await invoke("apply_update_cmd");
        } catch {
            setUpdateStatus("error");
            window.setTimeout(() => setUpdateStatus("idle"), 1500);
            return;
        }
        setUpdateStatus("idle");
    };
    return (
        <div className="flex border-b border-gray-700 items-center">
            <button
                onClick={() => setCurrentView("calendar")}
                className={`px-6 py-3 font-medium transition-colors ${currentView === "calendar"
                    ? "bg-gray-800 text-white border-b-2 border-blue-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                    }`}
            >
                Calendar
            </button>
            <button
                onClick={() => setCurrentView("categories")}
                className={`px-6 py-3 font-medium transition-colors ${currentView === "categories"
                    ? "bg-gray-800 text-white border-b-2 border-blue-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                    }`}
            >
                Categories
            </button>
            <button
                onClick={() => setCurrentView("regex")}
                className={`px-6 py-3 font-medium transition-colors ${currentView === "regex"
                    ? "bg-gray-800 text-white border-b-2 border-blue-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                    }`}
            >
                Regex
            </button>
            <button
                onClick={() => setCurrentView("skipped")}
                className={`px-6 py-3 font-medium transition-colors ${currentView === "skipped"
                    ? "bg-gray-800 text-white border-b-2 border-blue-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                    }`}
            >
                Skipped Apps
            </button>
            <button
                onClick={() => setCurrentView("googleCalendars")}
                className={`px-6 py-3 font-medium transition-colors ${currentView === "googleCalendars"
                    ? "bg-gray-800 text-white border-b-2 border-blue-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                    }`}
            >
                Google Calendars
            </button>
            <div className="flex-1" />
            <div className="px-4 flex items-center gap-3">
                {appVersion && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">v{appVersion}</span>
                        <button
                            onClick={updateStatus === "available" ? applyUpdate : checkForUpdates}
                            disabled={updateStatus === "checking" || updateStatus === "applying"}
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/50 disabled:opacity-60 ${updateStatus === "available"
                                ? "text-blue-300 hover:text-white hover:bg-blue-500/10"
                                : "text-gray-400 hover:text-white hover:bg-gray-900"
                                }`}
                            title={updateStatus === "available" ? "Update now" : "Check for updates"}
                        >
                            {updateStatus === "checking" || updateStatus === "applying" ? (
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-gray-200" />
                            ) : updateStatus === "upToDate" ? (
                                <span className="text-sm leading-none">✓</span>
                            ) : updateStatus === "available" ? (
                                <span className="text-sm leading-none">⬆</span>
                            ) : updateStatus === "error" ? (
                                <span className="text-sm leading-none">!</span>
                            ) : (
                                <span className="text-sm leading-none">⟳</span>
                            )}
                        </button>
                    </div>
                )}
                <span className={`text-sm ${isTracking ? 'text-green-400' : 'text-gray-500'}`}>
                    {isTracking ? 'Tracking' : 'Paused'}
                </span>
                <button
                    onClick={toggleTracking}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTracking ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                    aria-label={isTracking ? 'Pause tracking' : 'Resume tracking'}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTracking ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>
        </div>
    );
}
