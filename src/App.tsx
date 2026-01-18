import "./App.css";
import {useState, useEffect} from "react";

import Calendar from "./Screens/Calander/Calendar.tsx";
import CategoriesView from "./Componants/CategoriesView.tsx";
import CategoryRegexView from "./Screens/CategoryRegexView.tsx";
import SkippedAppsView from "./Screens/SkippedAppsView.tsx";
import DevTools from "./Screens/DevTools.tsx";
import DetailedStatistics from "./Screens/DetailedStatistics.tsx";
import AppsList from "./Screens/AppsList.tsx";
import Header from "./Componants/Header.tsx";

export type View = "calendar" | "categories" | "regex" | "skipped" | "devtools" | "detailed" | "apps";

export default function App() {
    const [currentView, setCurrentView] = useState<View>("calendar");

    return (
        <main className="bg-black text-white h-screen flex flex-col">
            <Header currentView={currentView} setCurrentView={setCurrentView}/>

            <div className="flex-1 overflow-auto">
                {currentView === "calendar" && <Calendar setCurrentView={setCurrentView}/>}
                {currentView === "categories" && <CategoriesView/>}
                {currentView === "regex" && <CategoryRegexView/>}
                {currentView === "skipped" && <SkippedAppsView/>}
                {currentView === "devtools" && <DevTools/>}
                {currentView === "detailed" && (<DetailedStatistics
                        onBack={() => setCurrentView("calendar")}
                    />
                )}
                {currentView === "apps" && (
                    <AppsList
                        onBack={() => setCurrentView("calendar")}
                    />
                )}
            </div>
        </main>
    );
}
