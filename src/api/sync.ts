import { invokeOrThrow } from "../utils.ts";

export type Device = {
    uuid: string;
    name: string;
    is_tracking: boolean;
};

export async function getLocalDevice(): Promise<Device> {
    return invokeOrThrow<Device>("get_local_device");
}

export async function getSyncServerIp(): Promise<string | null> {
    return invokeOrThrow<string | null>("get_sync_server_ip");
}

export async function setSyncServerIp(ip: string): Promise<void> {
    await invokeOrThrow("set_sync_server_ip", { ip });
}

export async function getDevices(): Promise<Device[]> {
    return invokeOrThrow<Device[]>("get_devices");
}

export async function pushAllLogs(): Promise<void> {
    await invokeOrThrow("push_all_logs");
}
