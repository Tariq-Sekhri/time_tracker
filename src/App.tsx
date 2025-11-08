import {useEffect, useState} from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
    const [greetMsg, setGreetMsg] = useState("");
    const [name, setName] = useState("");
    const [db, setDb] = useState("Missing Data");

    async function greet() {
        setGreetMsg(await invoke("greet", { name }));
    }

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

    useEffect(() => {
        console.log(db);
    }, [db]);

    return (
        <main className="container">
            <h1>Welcome to Tauri + React</h1>

            <div className="row">
                <a href="https://vite.dev" target="_blank">
                    <img src="/vite.svg" className="logo vite" alt="Vite logo" />
                </a>
                <a href="https://tauri.app" target="_blank">
                    <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
                </a>
                <a href="https://react.dev" target="_blank">
                    <img src={reactLogo} className="logo react" alt="React logo" />
                </a>
            </div>
            <p>Click on the Tauri, Vite, and React logos to learn more.</p>

            <form
                className="row"
                onSubmit={(e) => {
                    e.preventDefault();
                    greet();
                }}
            >
                <input
                    id="greet-input"
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Enter a name..."
                />
                <button type="submit">Greet</button>
            </form>
            <p>{greetMsg}</p>

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

            <button className="idk" onClick={db_to_json}>db_to_json</button>
            <button className="idk" onClick={get_cat_regex}>get_cat_regex</button>
            <button className="idk" onClick={get_logs}>get_logs</button>
            <button className="idk" onClick={get_categories}>get_categories</button>
        </main>
    );
}

export default App;