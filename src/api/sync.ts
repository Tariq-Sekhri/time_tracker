import { invokeOrThrow } from "../utils.ts";

export type DeviceState =
    | { Local: { token: string } }
    | { Remote: { is_tracking: boolean } };

export type Device = {
    uuid: string;
    name: string;
    state: DeviceState;
    last_sync_id: number;
};

export async function getServerIp(): Promise<string | null> {
    return invokeOrThrow<string | null>("get_server_ip");
}

export async function setServerIp(serverIp: string): Promise<void> {
    await invokeOrThrow("set_server_ip", { server_ip: serverIp });
}

export async function checkSyncServer(): Promise<void> {
    await invokeOrThrow("check");
}

export async function registerDevice(): Promise<void> {
    await invokeOrThrow("register");
}

export async function uploadAllLogs(): Promise<void> {
    await invokeOrThrow("upload_all_logs");
}

export async function syncLogs(): Promise<void> {
    await invokeOrThrow("sync");
}

export async function getDevices(): Promise<Device[]> {
    return invokeOrThrow<Device[]>("get_devices");
}

export async function fetchDeviceLogs(): Promise<void> {
    await invokeOrThrow("device_logs");
}

export async function setIsTracking(isTracking: boolean, uuid: string): Promise<void> {
    await invokeOrThrow("set_is_tracking", { new: isTracking, uuid });
}
