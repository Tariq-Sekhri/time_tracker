import {useEffect, useState} from "react"
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {
    getDevices,
    getLocalDevice,
    getSyncServerIp,
    pushAllLogs,
    setSyncServerIp,
} from "../api/sync.ts";

export default function Sync() {
    const queryClient = useQueryClient()
    const [serverLocked, setServerLocked] = useState(false)
    const [serverIp, setServerIp] = useState("")
    const [errorMessage, setErrorMessage] = useState("")

    const {data: savedServerIp} = useQuery({
        queryKey: ["sync_server_ip"],
        queryFn: getSyncServerIp,
    })

    const {data: localDevice} = useQuery({
        queryKey: ["local_device"],
        queryFn: getLocalDevice,
    })

    const {data: devices = []} = useQuery({
        queryKey: ["get_devices", savedServerIp],
        queryFn: getDevices,
        enabled: serverLocked && !!savedServerIp,
    });

    useEffect(() => {
        if (savedServerIp) {
            setServerIp(savedServerIp)
            setServerLocked(true)
        }
    }, [savedServerIp])

    async function checkServer() {
        const url = `http://${serverIp}:3000/v1/check`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error("Server check failed");
            return
        }
        const text = await res.text();
        if (text == "Time Tracker Backend v1") {
            await setSyncServerIp(serverIp)
            await queryClient.invalidateQueries({queryKey: ["sync_server_ip"]})
            setServerLocked(true)
        } else {
            setErrorMessage("server didnt respond with correct thing ")
        }
    }

    async function push_logs() {
        try {
            await pushAllLogs();
        } catch (e) {
            console.error(e)
        }
    }

    function idk(uuid: string) {
        console.log(uuid)
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
                    <button className={"p-1 bg-emerald-200 hover:bg-emerald-500"} onClick={push_logs}>
                        push logs
                    </button>
                    {localDevice && (
                        <p>This device: {localDevice.name} ({localDevice.uuid})</p>
                    )}
                    <h1 className={"text-3xl"}>Other Deives</h1>
                    <ul>
                        {devices.filter((device) => device.uuid !== localDevice?.uuid).map((device) => (
                            <div key={device.uuid}>
                                {device.name} {device.uuid} <input onClick={() => idk(device.uuid)} type={"checkbox"}/>
                            </div>
                        ))}
                    </ul>
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
