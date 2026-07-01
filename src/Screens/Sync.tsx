import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    checkSyncServer,
    fetchDeviceLogs,
    getDevices,
    getServerIp,
    registerDevice,
    setIsTracking,
    setServerIp,
    uploadAllLogs,
    type Device,
} from "../api/sync.ts";
import { useToast } from "../Componants/Toast.tsx";
import { toErrorString } from "../types/common.ts";

function formatCountdown(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function Sync() {
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const [ipInput, setIpInput] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [trackingError, setTrackingError] = useState<string | null>(null);
    const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

    useEffect(() => {
        let unlistenCountdown: (() => void) | null = null;
        let unlistenSyncStarted: (() => void) | null = null;

        const setup = async () => {
            unlistenCountdown = await listen<number>("count_down_to_sync", (e) => {
                const seconds = typeof e.payload === "number" ? e.payload : Number(e.payload);
                if (!Number.isFinite(seconds)) return;
                setIsSyncing(false);
                setCountdownSeconds(seconds);
            });
            unlistenSyncStarted = await listen("sync_started", () => {
                setIsSyncing(true);
                setCountdownSeconds(null);
            });
        };

        void setup();

        return () => {
            if (unlistenCountdown) unlistenCountdown();
            if (unlistenSyncStarted) unlistenSyncStarted();
        };
    }, []);

    const serverIpQuery = useQuery({
        queryKey: ["sync", "serverIp"],
        queryFn: getServerIp,
    });

    const checkMutation = useMutation({
        mutationFn: checkSyncServer,
        onSuccess: async (normalizedIp) => {
            await setServerIp(normalizedIp);
            await queryClient.invalidateQueries({ queryKey: ["sync", "serverIp"] });
            setServerError(null);
            setIpInput("");
        },
        onError: (e: unknown) => {
            setServerError(toErrorString(e));
        },
    });

    const devicesQuery = useQuery({
        queryKey: ["sync", "devices"],
        queryFn: getDevices,
        enabled: !!serverIpQuery.data,
    });

    const uploadLogsMutation = useMutation({
        mutationFn: uploadAllLogs,
        onSuccess: (count) => {
            showToast(`Uploaded ${count} logs`, "success");
        },
        onError: (e: unknown) => {
            showToast("Failed to upload logs", "error", 5000, toErrorString(e));
        },
    });

    const registerMutation = useMutation({
        mutationFn: registerDevice,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["sync", "devices"] });
            setRegisterError(null);
            setShowRegisterConfirm(false);
            uploadLogsMutation.mutate();
        },
        onError: (e: unknown) => {
            setRegisterError(toErrorString(e));
        },
    });

    const trackingMutation = useMutation({
        mutationFn: async ({
            isTracking,
            uuid,
            deviceName,
        }: {
            isTracking: boolean;
            uuid: string;
            deviceName: string;
        }) => {
            await setIsTracking(isTracking, uuid);
            if (isTracking) {
                const count = await fetchDeviceLogs(uuid);
                return { count, deviceName };
            }
            return null;
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["sync", "devices"] });
            setTrackingError(null);
            if (result) {
                showToast(`Added ${result.count} logs from ${result.deviceName}`, "success");
            }
        },
        onError: (e: unknown) => {
            setTrackingError(toErrorString(e));
        },
    });

    const serverIp = serverIpQuery.data ?? null;
    const isChecking = checkMutation.isPending;

    const localDevice = useMemo(() => {
        const devices = devicesQuery.data ?? [];
        return devices.find((device: Device) => "Local" in device.state) ?? null;
    }, [devicesQuery.data]);

    const remoteDevices = useMemo(() => {
        const devices = devicesQuery.data ?? [];
        return devices.filter((device: Device) => "Remote" in device.state);
    }, [devicesQuery.data]);

    const isRegistered = !!localDevice;

    const onCheck = () => {
        const ip = ipInput.trim();
        if (!ip) {
            setServerError("Enter a server IP");
            return;
        }
        setServerError(null);
        checkMutation.mutate(ip);
    };

    const onConfirmRegister = () => {
        setRegisterError(null);
        registerMutation.mutate();
    };

    if (serverIpQuery.isLoading) {
        return <div className="pt-10 pl-5 text-white">Loading server settings...</div>;
    }

    return (
        <div className="pt-10 pl-5 pr-5 text-white space-y-6">
            <div className="flex flex-wrap gap-4">
                {serverIp ? (
                    <div className="rounded bg-gray-900 p-4 inline-block">
                        <div className="text-sm text-gray-300">Server IP</div>
                        <div className="mt-1 font-mono">{serverIp}</div>
                    </div>
                ) : null}
                <div className="rounded bg-gray-900 p-4 inline-block min-w-[160px]">
                    <div className="text-sm text-gray-300">Next automatic sync</div>
                    <div className="mt-1 font-mono text-lg">
                        {isSyncing
                            ? "Syncing…"
                            : countdownSeconds !== null
                              ? formatCountdown(countdownSeconds)
                              : "—"}
                    </div>
                </div>
            </div>

            {!serverIp ? (
                <div className="flex flex-col gap-3 max-w-md">
                    <div className="text-sm text-gray-300">No server configured. Enter a server IP.</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={ipInput}
                            onChange={(e) => setIpInput(e.target.value)}
                            placeholder="Server IP"
                            className="flex-1 px-3 py-2 rounded bg-gray-800 text-white"
                        />
                        <button
                            type="button"
                            onClick={onCheck}
                            disabled={isChecking}
                            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                        >
                            {isChecking ? "Checking..." : "Check"}
                        </button>
                    </div>
                </div>
            ) : null}

            {serverError ? <div className="text-sm text-red-400">{serverError}</div> : null}

            <section className="bg-gray-900 rounded p-4 space-y-3">
                <div>
                    <h2 className="text-lg font-semibold">Local device (push to server)</h2>
                    <div className="text-sm text-gray-300">Register this device to get a local UUID and token.</div>
                </div>
                <div className="flex items-center gap-3">
                    {!isRegistered ? (
                        <button
                            type="button"
                            onClick={() => setShowRegisterConfirm(true)}
                            disabled={registerMutation.isPending || !serverIp}
                            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                        >
                            Register
                        </button>
                    ) : (
                        <span className="px-3 py-1 rounded bg-green-900/50 text-green-300 text-sm">Registered</span>
                    )}
                </div>
                <div className="text-sm">
                    {localDevice ? (
                        <span>
                            Local UUID: <span className="font-mono">{localDevice.uuid}</span>
                        </span>
                    ) : (
                        <span className="text-gray-300">No local device registered yet.</span>
                    )}
                </div>
                {registerError ? <div className="text-sm text-red-400">{registerError}</div> : null}
            </section>

            <section className="bg-gray-900 rounded p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                    <h2 className="text-lg font-semibold">Server devices (pull from server)</h2>
                    <div className="text-sm text-gray-300">Subscribe to devices to download their logs.</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => devicesQuery.refetch()}
                        disabled={devicesQuery.isFetching || !serverIp}
                        className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-60"
                    >
                        Refresh devices
                    </button>
                </div>
                {devicesQuery.isLoading ? (
                    <div className="text-sm text-gray-300">Loading devices...</div>
                ) : devicesQuery.isError ? (
                    <div className="text-sm text-red-400">{toErrorString(devicesQuery.error)}</div>
                ) : remoteDevices.length === 0 ? (
                    <div className="text-sm text-gray-300">No remote devices found.</div>
                ) : (
                    <div className="space-y-2">
                        {remoteDevices.map((device) => {
                            const isTracking =
                                "Remote" in device.state ? device.state.Remote.is_tracking : false;
                            const isPendingForDevice =
                                trackingMutation.isPending &&
                                trackingMutation.variables?.uuid === device.uuid;
                            return (
                                <div
                                    key={device.uuid}
                                    className="rounded border border-gray-700 bg-gray-800/80 px-3 py-3 flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium">{device.name}</div>
                                        <div className="text-xs text-gray-300 font-mono truncate">{device.uuid}</div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isPendingForDevice}
                                        onClick={() =>
                                            trackingMutation.mutate({
                                                isTracking: !isTracking,
                                                uuid: device.uuid,
                                                deviceName: device.name,
                                            })
                                        }
                                        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                            isTracking
                                                ? "bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30"
                                                : "bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700"
                                        } disabled:opacity-60`}
                                    >
                                        {isPendingForDevice
                                            ? isTracking
                                                ? "Unsubscribing..."
                                                : "Downloading..."
                                            : isTracking
                                              ? "Subscribed"
                                              : "Subscribe"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
                {trackingError ? <div className="text-sm text-red-400">{trackingError}</div> : null}
            </section>

            {showRegisterConfirm ? (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white">Register this device?</h3>
                        <p className="text-gray-300 mb-4">
                            Registering means uploading your logs to the server.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowRegisterConfirm(false)}
                                disabled={registerMutation.isPending}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={onConfirmRegister}
                                disabled={registerMutation.isPending}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50"
                            >
                                {registerMutation.isPending ? "Registering..." : "Register"}
                            </button>
                        </div>
                        {registerError ? <div className="text-sm text-red-400 mt-4">{registerError}</div> : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
