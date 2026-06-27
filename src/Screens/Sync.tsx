import {useState} from "react"
import {getAppMetadata} from "../api/appMetadata.ts";
import {useQuery} from "@tanstack/react-query";


export default function Sync() {
    const SERVER_IP = "server_ip";
    const {data: serverIp = "100.75.95.90"} = useQuery({
        queryKey: ["sync_server_ip"],
        queryFn: getSyncServerIp,
    })

    getAppMetadata(SERVER_IP)

    return (
        <div className={"pt-10 pl-5"}>

        </div>)
}
