import { useState } from "react";
import { get_logs, Log } from "../api/Log.ts";
import { get_categories, Category } from "../api/Category.ts";
import { get_week, TimeBlock } from "../api/week.ts";
import { CategoryRegex, get_cat_regex } from "../api/CategoryRegex.ts";
import { AppError, Result } from "../types/common.ts";
import { listen } from "@tauri-apps/api/event";

export default function DevTools() {
    const [displayText, setDisplayText] = useState<string>("Click a button to view data");
    listen("BackgroundProcessError", e => console.error(e.payload));
    const [weekData, setWeekData] = useState<TimeBlock[] | null>(null)

    async function getCatRegex() {
        const result: Result<CategoryRegex[], AppError> = await get_cat_regex();
        if (result.success) {
            setDisplayText(JSON.stringify(result.data, null, 2));
        } else {
            setDisplayText(JSON.stringify(result.error, null, 2));
        }
    }

    async function getLogs() {
        const result: Result<Log[], AppError> = await get_logs();
        if (result.success) {
            setDisplayText(JSON.stringify(result.data.slice(-20), null, 2));
        } else {
            setDisplayText(JSON.stringify(result.error, null, 2));
        }
    }

    async function getCategories() {
        const result: Result<Category[], AppError> = await get_categories();
        if (result.success) {
            setDisplayText(JSON.stringify(result.data, null, 2));
        } else {
            setDisplayText(JSON.stringify(result.error, null, 2));
        }
    }

    async function getWeek() {
        const result: Result<TimeBlock[], AppError> = await get_week(new Date());
        if (result.success) {
            setDisplayText(JSON.stringify(result.data.slice(-20), null, 2));
        } else {
            setDisplayText(JSON.stringify(result.error, null, 2));
        }
    }

    return (
        <div className="p-6 text-white h-full overflow-auto">
            <h1 className="text-3xl font-bold mb-6">Dev Tools - Database Queries</h1>
            
            <div className="mb-6 flex gap-3 flex-wrap">
                <button 
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded" 
                    onClick={getCatRegex}
                >
                    get_cat_regex
                </button>
                <button 
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded" 
                    onClick={getLogs}
                >
                    get_logs
                </button>
                <button 
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded" 
                    onClick={getCategories}
                >
                    get_categories
                </button>
                <button 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded" 
                    onClick={getWeek}
                >
                    get_week
                </button>
            </div>

            <div className="bg-gray-900 p-4 rounded-lg">
                <pre className="text-sm whitespace-pre-wrap overflow-auto">{displayText}</pre>
            </div>
        </div>
    );
}

