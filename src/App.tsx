import "./App.css";
import { useState } from "react";
import Calendar from "./Componants/Calendar.tsx";
import CategoriesView from "./Componants/CategoriesView.tsx";
import CategoryRegexView from "./Componants/CategoryRegexView.tsx";
import SkippedAppsView from "./Componants/SkippedAppsView.tsx";
import DevTools from "./Componants/DevTools.tsx";

type View = "calendar" | "categories" | "regex" | "skipped" | "devtools";

export default function App() {
    const [currentView, setCurrentView] = useState<View>("calendar");

    return (
        <main className="bg-black text-white h-screen flex flex-col">
            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-700">
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
