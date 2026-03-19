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
import { ToastProvider } from "./Componants/Toast.tsx";

export type View = "calendar" | "categories" | "regex" | "skipped" | "detailed" | "apps" | "googleCalendars";

export default function App() {
    const [currentView, setCurrentView] = useState<View>("calendar");
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);

    useEffect(() => {
        let unlistenFn: (() => void) | null = null;
        const setup = async () => {
            const unlisten = await listen("update-available", () => {
                setUpdateAvailable(true);
            });
            unlistenFn = unlisten;
        };

        setup();

        return () => {
            if (unlistenFn) unlistenFn();
        };
    }, []);

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
        <ToastProvider>
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

                <div className="flex-1 overflow-auto">
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
                    {currentView === "googleCalendars" && <GoogleCalendarsView />}
                </div>
            </main>
        </ToastProvider>
    );
}
