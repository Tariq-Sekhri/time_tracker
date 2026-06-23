import {useEffect, useState} from "react"
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {
    getDevices,
    getLocalDevice,
    getSyncServerIp,
    pushAllLogs,
    setIsTracking,
    setSyncServerIp,
} from "../api/sync.ts";

export default function Sync() {
    const queryClient = useQueryClient()
    const [editingServer, setEditingServer] = useState(false)
    const [serverIpInput, setServerIpInput] = useState("")
    const [trackingByUuid, setTrackingByUuid] = useState<Record<string, boolean>>({})

    const {data: serverIp = "100.75.95.90"} = useQuery({
        queryKey: ["sync_server_ip"],
        queryFn: getSyncServerIp,
    })

    const {data: localDevice} = useQuery({
        queryKey: ["local_device"],
        queryFn: getLocalDevice,
    })

    const {
        data: devices = [],
        isLoading: devicesLoading,
        isError: devicesError,
        error: devicesFetchError,
        refetch: refetchDevices
    } = useQuery({
        queryKey: ["get_devices", serverIp],
        queryFn: getDevices,
    });

    const otherDevices = devices.filter((device) => device.uuid !== localDevice?.uuid)

    useEffect(() => {
        setTrackingByUuid(Object.fromEntries(devices.map((device) => [device.uuid, device.is_tracking])))
    }, [devices])

    async function saveServerIp() {
        await setSyncServerIp(serverIpInput)
        await queryClient.invalidateQueries({queryKey: ["sync_server_ip"]})
        await queryClient.invalidateQueries({queryKey: ["get_devices"]})
        setEditingServer(false)
    }

    async function push_logs() {
        try {
            await pushAllLogs();
        } catch (e) {
            console.error(e)
        }
    }

    async function toggleTracking(uuid: string, isTracking: boolean) {
        try {
            await setIsTracking(isTracking, uuid);
            setTrackingByUuid((prev) => ({...prev, [uuid]: isTracking}));
        } catch (e) {
            console.error(e);
        }
    }

    return (
        <div className={"pt-10 pl-5"}>
            {editingServer ? (
                <>
                    <input
                        className={"p-2 bg-red-500"}
                        value={serverIpInput}
                        onChange={(e) => setServerIpInput(e.target.value)}
                    />
                    <button className={"p-2 bg-emerald-200 hover:bg-emerald-500"} onClick={saveServerIp}>
                        Save
                    </button>
                    <button
                        className={"p-2 ml-2 bg-emerald-200 hover:bg-emerald-500"}
                        onClick={() => setEditingServer(false)}
                    >
                        Cancel
                    </button>
                </>
            ) : (
                <>
                    {serverIp}
                    <button
                        className={"p-2 ml-5 bg-emerald-200 hover:bg-emerald-500"}
                        onClick={() => {
                            setServerIpInput(serverIp)
                            setEditingServer(true)
                        }}
                    >
                        Change Server
                    </button>
                </>
            )}
            <br/>
            <button className={"p-1 bg-emerald-200 hover:bg-emerald-500"} onClick={push_logs}>
                push logs
            </button>
            {localDevice && (
                <p>This device: {localDevice.name} ({localDevice.uuid})</p>
            )}
            <h1 className={"text-3xl"}>Other Deives</h1>
            {devicesLoading && <p>Loading devices...</p>}
            {devicesError && (
                <p className={"text-red-600"}>
                    Failed to load devices: {String(devicesFetchError)}
                    <button className={"ml-2 underline"} onClick={() => refetchDevices()}>Retry</button>
                </p>
            )}
            {!devicesLoading && !devicesError && otherDevices.length === 0 && (
                <p>No other devices on the server yet.</p>
            )}
            <ul>
                {otherDevices.map((device) => (
                    <div key={device.uuid}>
                        Name: {device.name} ({device.uuid}){" "}
                        <input
                            className={"size-4"}
                            type={"checkbox"}
                            checked={trackingByUuid[device.uuid] ?? device.is_tracking}
                            onChange={(e) => toggleTracking(device.uuid, e.target.checked)}
                        />
                    </div>
                ))}
            </ul>
        </div>)
}
