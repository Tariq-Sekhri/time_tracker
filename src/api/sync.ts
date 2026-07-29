import { invokeOrThrow } from "../utils.ts";

export type DeviceState =
    | { Local: { token: string } }
    | { Remote: { is_tracking: boolean } };

export type Device = {
    uuid: string;
    name: string;
    state: DeviceState;
    last_sync_id: number;
    is_active: boolean;
    in_cal: boolean;
    in_stats: boolean;
    available_on_server: boolean;
    has_local_logs: boolean;
};

export type UpdateDevice = {
    uuid: string;
    in_cal?: boolean;
    in_stats?: boolean;
};

export async function getServerIp(): Promise<string | null> {
    return invokeOrThrow<string | null>("get_server_ip");
}

export async function setServerIp(serverIp: string): Promise<void> {
    await invokeOrThrow("set_server_ip", { serverIp });
}

export async function checkSyncServer(ip: string): Promise<string> {
    return invokeOrThrow<string>("check", { ip });
}

export async function getLocalDeviceName(): Promise<string> {
    return invokeOrThrow<string>("get_local_device_name");
}

export async function registerDevice(name: string): Promise<void> {
    await invokeOrThrow("register", { name });
}

export async function checkDeviceActivation(): Promise<boolean> {
    return invokeOrThrow<boolean>("check_device_activation");
}

export async function uploadAllLogs(): Promise<number> {
    return invokeOrThrow<number>("upload_all_logs");
}

export async function reuploadAllLogs(): Promise<number> {
    return invokeOrThrow<number>("reupload_all_logs");
}

export async function getSyncCountdown(): Promise<number | null> {
    return invokeOrThrow<number | null>("get_sync_countdown");
}

export async function syncNow(): Promise<void> {
    await invokeOrThrow("sync_now");
}

export async function syncLogs(): Promise<void> {
    await invokeOrThrow("sync");
}

export async function getDevices(): Promise<Device[]> {
    return invokeOrThrow<Device[]>("get_devices");
}

export async function fetchDeviceLogs(deviceUuid?: string): Promise<number> {
    return invokeOrThrow<number>("device_logs", { deviceUuid: deviceUuid ?? null });
}

export async function setIsTracking(isTracking: boolean, uuid: string): Promise<void> {
    await invokeOrThrow("set_is_tracking", { new: isTracking, uuid });
}

export async function unsubscribeDevice(uuid: string): Promise<void> {
    await invokeOrThrow("unsubscribe_device", { uuid });
}

export async function updateDevice(update: UpdateDevice): Promise<void> {
    await invokeOrThrow("update_device", { update });
}

export function isRemoteDeviceTracked(device: Device): boolean {
    return "Remote" in device.state && device.state.Remote.is_tracking;
}

export function isLocalDevice(device: Device): boolean {
    return "Local" in device.state;
}

export function getCalendarDevices(devices: Device[]): Device[] {
    return devices.filter((device) => isLocalDevice(device) || isRemoteDeviceTracked(device));
}

export function buildDeviceUuidsForFilter(
    devices: Device[],
    include: (device: Device) => boolean,
): string[] | null {
    if (devices.length === 0) return null;
    return devices.filter(include).map((d) => d.uuid);
}
