import { useState} from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {

    const [weekNum, setWeekNum] = useState("");
    const [db, setDb] = useState("Missing Data");

    async function db_to_json(){
        setDb(await invoke("db_to_json"));
    }

    async function get_cat_regex(){
        setDb(await invoke("get_cat_regex_cmd"));
    }

    async function get_logs(){
        const data:string = await invoke("get_logs_cmd");
        const logs = JSON.parse(data).slice(-20);
        setDb(logs);
    }

    async function get_categories(){
        setDb(await invoke("get_categories_cmd"));
    }

    async function get_week(){
        setDb(await invoke("get_week"));
    }

    // useEffect(() => {
    //     console.log(db);
    // }, [db]);

    return (
        <main className="bg-black text-white ">
            <button className="bg-red-500" onClick={db_to_json}>db_to_json</button><br/>
            <button className="bg-red-500" onClick={get_cat_regex}>get_cat_regex</button><br/>
            <button className="bg-red-500" onClick={get_logs}>get_logs</button><br/>
            <button className="bg-red-500" onClick={get_categories}>get_categories</button><br/>
            <button className="bg-blue-500" onClick={get_week}>get_week</button>







            <div>
                {Array.isArray(db) ? (
                    db.map(log => (
                        <div key={log.id}>
                            {log.app} - {log.duration}s
                        </div>
                    ))
                ) : (
                    <p className="db">{db}</p>
                )}
            </div>


            <form className="row">
                <input
                    type="number"
                    value={weekNum}
                    onChange={(e) => setWeekNum(e.currentTarget.value)}
                    placeholder="Enter week number..."
                />
            </form>
        </main>
    );
}

export default App;