import {useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import "./App.css";

function App() {
    const [weekNum, setWeekNum] = useState("");
    const [displayText, setDisplayText] = useState("Missing Data");

    function getWeekRange(date: Date): { week_start: number; week_end: number } {
        const d = new Date(date);

        // Get Monday of the week containing 'date'
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        // Get Sunday
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        return {
            week_start: Math.floor(monday.getTime() / 1000),
            week_end: Math.floor(sunday.getTime() / 1000)
        };
    }

    async function db_to_json() {
        setDisplayText(JSON.parse(await invoke("db_to_json")));

    }

    async function get_cat_regex() {
        setDisplayText(JSON.parse(await invoke("get_cat_regex_cmd")));
    }

    async function get_logs() {
        const data: string = await invoke("get_logs_cmd");
        const logs = JSON.parse(data).slice(-4);
        setDisplayText(logs);
    }

    async function get_categories() {
        setDisplayText(JSON.parse(await invoke("get_categories_cmd")));
    }

    async function getWeek() {
        const {week_start, week_end} = getWeekRange(new Date())
        const data: string = await invoke("get_week", {weekStart: week_start, weekEnd: week_end})
        const asd = JSON.parse(data);
        console.log(asd);
        setDisplayText(asd);
    }

    // useEffect(() => {
    //     console.log(displayText);
    // }, [displayText]);

    return (
        <main className="bg-black text-white ">
            <button className="bg-red-500 text-xl" onClick={db_to_json}>db_to_json</button>
            <br/>
            <button className="bg-red-500 text-xl" onClick={get_cat_regex}>get_cat_regex</button>
            <br/>
            <button className="bg-red-500 text-xl" onClick={get_logs}>get_logs</button>
            <br/>
            <button className="bg-red-500 text-xl" onClick={get_categories}>get_categories</button>
            <br/>
            <button className="bg-blue-500 text-2xl fixed left-30 top-0" onClick={getWeek}>get_week</button>

            <div>
    <pre className="text-xl">
        {JSON.stringify(displayText, null, 2)}
    </pre>
            </div>


        </main>
    );
}

export default App;