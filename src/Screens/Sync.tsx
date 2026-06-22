import {useState} from "react"
import {invokeOrThrow} from "../utils.ts";

export default function Sync() {
    const [serverLocked, setServerLocked] = useState(false)
    const [serverIp, setServerIp] = useState("100.75.95.90")
    const [errorMessage, setErrorMessage] = useState("")

    async function checkServer() {
        let url = `http://${serverIp}:3000/v1/check`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error("Server check failed");
            return
        }
        let text = await res.text();
        if (text == "Time Tracker Backend v1") {
            setServerLocked(true)
        } else {
            setErrorMessage("server didnt respond with correct thing ")
        }
        // console.log(text);

    }


    async function push_all_logs(): Promise<String> {
        return invokeOrThrow<String>("push_all_logs");
    }

    async function push_logs() {
        try {
            let res = await push_all_logs();
            console.log(res)
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className={"pt-10 pl-5"}>
            {serverLocked ?
                (<div>
                    {serverIp}
                    <button className={"p-2 ml-5 bg-emerald-200 hover:bg-emerald-500 "} onClick={() => {
                        setServerLocked(false)
                    }}>Change Server
                    </button>
                    <br/>
                    <button onClick={push_logs}>
                        push logs
                    </button>
                </div>)
                : (
                    <>
                        <input className={"p-2 bg-red-500"} value={serverIp}
                               onChange={(e) => setServerIp(e.target.value)}></input>
                        <button className={" p-2 bg-emerald-200 hover:bg-emerald-500"} onClick={checkServer}>Check
                        </button>
                        <p>{errorMessage}</p>
                    </>
                )
            }
        </div>)
}