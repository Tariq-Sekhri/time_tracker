import { useState } from "react";
import "../App.css";
import { get_logs, Log } from "../api/Log.ts";
import { get_categories, Category } from "../api/Category.ts";
import { get_week, TimeBlock } from "../api/week.ts";
import { CategoryRegex, get_cat_regex } from "../api/CategoryRegex.ts";
import { AppError, Result } from "../types/common.ts";
import { listen } from "@tauri-apps/api/event";

export default function Temp() {
    const [displayText, setDisplayText] = useState<string>("Missing Data");
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
        <main className="bg-black text-white">
            <button className="text-xl fixed left-0 top-0 px-2 bg-purple-500" onClick={getCatRegex}>get_cat_regex
            </button>
            <button className="text-xl fixed left-33 top-0 px-2 bg-orange-500" onClick={getLogs}>get_logs</button>
            <button className="text-xl fixed left-55 top-0 px-2 bg-red-500" onClick={getCategories}>get_categories
            </button>
            <button className="text-2xl fixed left-100 top-0 px-2 bg-blue-500" onClick={getWeek}>get_week</button>
            <br /><br />
            <div>
                <pre className="text-xl whitespace-pre-wrap">{displayText}</pre>
            </div>
        </main>
    );
}

