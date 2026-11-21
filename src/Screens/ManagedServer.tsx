import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {invokeOrThrow} from "../utils.ts";
import {toErrorString} from "../types/common.ts";

type ServerStatus = {
    supported: boolean;
    firewall_supported: boolean;
    installed: boolean;
    running: boolean;
    address: string | null;
    local_address: string | null;
    suggested_ip: string | null;
    bind_ip: string | null;
    port: number;
};

type ServerDevice = {
    uuid: string;
    name: string;
    is_active: boolean;
    role: "logger" | "consumer" | "integration";
};

const button = "rounded bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600 disabled:opacity-50";
const primary = "rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50";
const input = "w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";
const statusKey = ["sync", "managedServer"];
const devicesKey = ["sync", "managedDevices"];

export function ManagedServer({hasServerConnection, onConnect}: {
    hasServerConnection: boolean;
    onConnect: (address: string) => void;
}) {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [showAdmin, setShowAdmin] = useState(false);
    const [address, setAddress] = useState("");
    const [port, setPort] = useState("8765");
    const [feedback, setFeedback] = useState<string>();
    const status = useQuery({
        queryKey: statusKey,
        queryFn: () => invokeOrThrow<ServerStatus>("managed_server_status"),
        refetchInterval: 5000,
    });
    const server = status.data;
    const devices = useQuery({
        queryKey: devicesKey,
        queryFn: () => invokeOrThrow<ServerDevice[]>("managed_server_devices"),
        enabled: showAdmin && server?.running === true,
        refetchInterval: 5000,
    });
    const manage = useMutation({
        mutationFn: async ({command, args}: {command: string; args?: Record<string, unknown>}) => {
            setFeedback(undefined);
            return invokeOrThrow<ServerStatus>(command, args);
        },
        onSuccess: (updated) => {
            queryClient.setQueryData(statusKey, updated);
            setEditing(false);
            if (updated.running) setShowAdmin(true);
        },
        onSettled: () => void queryClient.invalidateQueries({queryKey: statusKey}),
    });
    const admin = useMutation({
        mutationFn: async ({command, args}: {command: string; args?: Record<string, unknown>}) => {
            setFeedback(undefined);
            return invokeOrThrow<string | null>(command, args);
        },
        onSuccess: (path, {command}) => {
            if (path) setFeedback(`Backup saved to ${path}`);
            if (command === "managed_server_allow_lan") setFeedback("Allowed on private Windows networks.");
            void queryClient.invalidateQueries({queryKey: devicesKey});
        },
    });

    if (status.isError && !server) {
        return <p role="alert" className="text-sm text-rose-300">{toErrorString(status.error)}</p>;
    }
    if (!server?.supported || (hasServerConnection && !server.installed)) return null;
    const busy = manage.isPending || admin.isPending;
    const error = manage.error ?? admin.error;
    const editAddress = () => {
        manage.reset();
        setAddress(server.bind_ip ?? server.suggested_ip ?? "127.0.0.1");
        setPort(String(server.port));
        setEditing(true);
    };

    return <section className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h2 className="text-lg font-semibold">{server.installed ? "Sync server on this computer" : "Host a sync server"}</h2>
                {server.installed && <p className={server.running ? "text-sm text-emerald-300" : "text-sm text-gray-400"}>
                    {server.running ? "Running" : "Stopped"}
                </p>}
            </div>
            {!editing && (server.installed
                ? <button className={button} onClick={() => setShowAdmin(!showAdmin)} aria-expanded={showAdmin}>Manage server</button>
                : <button className={primary} onClick={editAddress}>Set up a sync server</button>)}
        </div>
        {editing && <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            manage.mutate({command: "managed_server_setup", args: {address, port: Number(port)}});
        }}>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <label className="space-y-1 text-sm"><span>This computer’s IP address</span>
                    <input className={input} value={address} onChange={event => setAddress(event.target.value.trim())} required />
                </label>
                <label className="space-y-1 text-sm"><span>Port</span>
                    <input className={input} type="number" min={1} max={65535} value={port} onChange={event => setPort(event.target.value)} required />
                </label>
            </div>
            <p className="text-sm text-gray-400">Use this computer’s Wi-Fi or Ethernet address to connect other devices on your network.</p>
            <div className="flex flex-wrap gap-2">
                <button className={primary} disabled={busy}>{manage.isPending ? "Preparing server…" : server.installed ? "Save and start" : "Download and start"}</button>
                <button type="button" className={button} disabled={busy} onClick={() => {manage.reset(); setEditing(false);}}>Cancel</button>
            </div>
        </form>}
        {server.installed && showAdmin && !editing && <div className="space-y-4">
            {server.address && <div className="flex flex-wrap items-center gap-2">
                <code className="select-all break-all rounded bg-gray-950 px-3 py-2 text-sm">{server.address}</code>
                <button className={button} onClick={() => void navigator.clipboard.writeText(server.address!).then(
                    () => setFeedback("Address copied."), () => setFeedback("Select the address to copy it."),
                )}>Copy address</button>
                {server.running && server.local_address && <button className={button} onClick={() => onConnect(server.local_address!)}>Connect this device</button>}
            </div>}
            <div className="flex flex-wrap gap-2">
                <button className={button} disabled={busy} onClick={() => manage.mutate({command: "managed_server_running", args: {enabled: !server.running}})}>
                    {manage.isPending ? "Working…" : server.running ? "Stop server" : "Start server"}
                </button>
                {!server.running && <button className={button} onClick={editAddress} disabled={busy}>Change address</button>}
                {server.running && <button className={button} disabled={busy} onClick={() => admin.mutate({command: "managed_server_backup"})}>Create backup</button>}
                {server.firewall_supported && server.bind_ip && !server.bind_ip.startsWith("127.") &&
                    <button className={button} disabled={busy} onClick={() => admin.mutate({command: "managed_server_allow_lan"})}>Allow through Windows firewall</button>}
            </div>
            {server.running && <div className="space-y-2">
                <h3 className="font-medium">Device approvals</h3>
                {devices.isPending && <p className="text-sm text-gray-400">Loading devices…</p>}
                {devices.isError && <p role="alert" className="text-sm text-rose-300">{toErrorString(devices.error)}</p>}
                {devices.data?.length === 0 && <p className="text-sm text-gray-400">Waiting for a device to connect.</p>}
                {devices.data?.map(device => <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-800 px-3 py-2" key={device.uuid}>
                    <div><div>{device.name}</div><div className="text-sm capitalize text-gray-300">{device.role} · {device.is_active ? "Approved" : "Waiting for approval"}</div></div>
                    <button className={device.is_active ? button : primary} disabled={busy} onClick={() => admin.mutate({
                        command: "managed_server_approve", args: {uuid: device.uuid, active: !device.is_active},
                    })}>{device.is_active ? "Deactivate" : "Approve"}</button>
                </div>)}
            </div>}
        </div>}
        {feedback && <p role="status" className="select-text break-all text-sm text-gray-300">{feedback}</p>}
        {error && <p role="alert" className="text-sm text-rose-300">{toErrorString(error)}</p>}
    </section>;
}
