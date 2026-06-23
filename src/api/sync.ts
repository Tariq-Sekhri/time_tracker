import { invokeOrThrow } from "../utils.ts";

export type Device = {
    uuid: string;
    name: string;
    is_tracking: boolean;
};

export async function getLocalDevice(): Promise<Device> {
    return invokeOrThrow<Device>("get_local_device");
}

export async function getSyncServerIp(): Promise<string> {
    return invokeOrThrow<string>("get_sync_server_ip");
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

export async function setIsTracking(isTracking: boolean, uuid: string): Promise<void> {
    await invokeOrThrow("set_is_tracking", { new: isTracking, uuid });
}

export async function insertDevices(devices: Device[]): Promise<void> {
    await invokeOrThrow("insert_devices", { devices });
}
