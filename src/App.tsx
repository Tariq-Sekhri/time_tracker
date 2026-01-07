import "./App.css";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Calendar from "./Componants/Calendar.tsx";
import CategoriesView from "./Componants/CategoriesView.tsx";
import CategoryRegexView from "./Componants/CategoryRegexView.tsx";
import SkippedAppsView from "./Componants/SkippedAppsView.tsx";
import DevTools from "./Componants/DevTools.tsx";

type View = "calendar" | "categories" | "regex" | "skipped" | "devtools";

export default function App() {
    const [currentView, setCurrentView] = useState<View>("calendar");
    const [isTracking, setIsTracking] = useState(true);

    // Load initial tracking status
    useEffect(() => {
        invoke<boolean>("get_tracking_status").then(setIsTracking);
    }, []);

    // Listen for tracking status changes from tray menu
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

    return (
        <main className="bg-black text-white h-screen flex flex-col">
            {/* Navigation Tabs */}
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
                    onClick={() => setCurrentView("devtools")}
                    className={`px-6 py-3 font-medium transition-colors ${currentView === "devtools"
                        ? "bg-gray-800 text-white border-b-2 border-blue-500"
                        : "text-gray-400 hover:text-white hover:bg-gray-900"
                        }`}
                >
                    Dev Tools
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Tracking Toggle */}
                <div className="px-4 flex items-center gap-3">
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

            {/* Content Area */}
            <div className="flex-1 overflow-auto">
                {currentView === "calendar" && <Calendar />}
                {currentView === "categories" && <CategoriesView />}
                {currentView === "regex" && <CategoryRegexView />}
                {currentView === "skipped" && <SkippedAppsView />}
                {currentView === "devtools" && <DevTools />}
            </div>
        </main>
    );
}
