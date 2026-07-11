import {useEffect, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    checkSyncServer,
    fetchDeviceLogs,
    getDevices,
    getLocalDeviceName,
    getServerIp,
    registerDevice,
    setIsTracking,
    setServerIp as persistServerIp,
    reuploadAllLogs,
    syncNow,
    unsubscribeDevice,
    type Device,
} from "../api/sync.ts";
import {useToast} from "../Componants/Toast.tsx";
import {toErrorString} from "../types/common.ts";
import type {useSyncTimer} from "../hooks/useSyncTimer.ts";

function formatCountdown(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function Sync({syncTimer}: {syncTimer: ReturnType<typeof useSyncTimer>}) {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const {countdownSeconds, isSyncing, setIsSyncing, setCountdownSeconds} = syncTimer;
    const [ipInput, setIpInput] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [trackingError, setTrackingError] = useState<string | null>(null);
    const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
    const [unsubscribeConfirm, setUnsubscribeConfirm] = useState<{ uuid: string; name: string } | null>(
        null,
    );
    const [deviceNameInput, setDeviceNameInput] = useState("");
    const [deviceNameInitialized, setDeviceNameInitialized] = useState(false);
    const [isChangingServer, setIsChangingServer] = useState(false);
    const [pendingDeviceUuids, setPendingDeviceUuids] = useState<Set<string>>(() => new Set());

    const serverIpQuery = useQuery({
        queryKey: ["sync", "serverIp"],
        queryFn: getServerIp,
    });

    const checkMutation = useMutation({
        mutationFn: checkSyncServer,
        onSuccess: async (normalizedIp) => {
            await persistServerIp(normalizedIp);
            await queryClient.invalidateQueries({queryKey: ["sync", "serverIp"]});
            setServerError(null);
            setIpInput("");
            setIsChangingServer(false);
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

    const defaultDeviceNameQuery = useQuery({
        queryKey: ["sync", "defaultDeviceName"],
        queryFn: getLocalDeviceName,
        enabled: !!serverIpQuery.data,
    });

    const reuploadLogsMutation = useMutation({
        mutationFn: reuploadAllLogs,
        onSuccess: (count) => {
            showToast(`Re-uploaded ${count} logs`, "success");
        },
        onError: (e: unknown) => {
            showToast("Failed to re-upload logs", "error", 5000, toErrorString(e));
        },
    });

    const syncNowMutation = useMutation({
        mutationFn: syncNow,
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["sync", "devices"]});
            showToast("Synced", "success");
        },
        onError: (e: unknown) => {
            setIsSyncing(false);
            showToast("Sync failed", "error", 5000, toErrorString(e));
        },
    });

    const registerMutation = useMutation({
        mutationFn: registerDevice,
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["sync", "devices"]});
            setRegisterError(null);
            setShowRegisterConfirm(false);
            reuploadLogsMutation.mutate();
        },
        onError: (e: unknown) => {
            setRegisterError(toErrorString(e));
        },
    });

    const subscribeMutation = useMutation({
        mutationFn: async ({uuid, deviceName}: {uuid: string; deviceName: string}) => {
            await setIsTracking(true, uuid);
            const count = await fetchDeviceLogs(uuid);
            return {count, deviceName};
        },
        onMutate: ({uuid}) => {
            setPendingDeviceUuids((prev) => new Set(prev).add(uuid));
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({queryKey: ["sync", "devices"]});
            setTrackingError(null);
            showToast(`Added ${result.count} logs from ${result.deviceName}`, "success");
        },
        onError: (e: unknown) => {
            setTrackingError(toErrorString(e));
        },
        onSettled: (_result, _error, variables) => {
            setPendingDeviceUuids((prev) => {
                const next = new Set(prev);
                next.delete(variables.uuid);
                return next;
            });
        },
    });

    const unsubscribeMutation = useMutation({
        mutationFn: async ({uuid}: {uuid: string}) => {
            await unsubscribeDevice(uuid);
        },
        onMutate: ({uuid}) => {
            setPendingDeviceUuids((prev) => new Set(prev).add(uuid));
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ["sync", "devices"]});
            setTrackingError(null);
            setUnsubscribeConfirm(null);
            showToast("Unsubscribed and removed local logs for this device", "success");
        },
        onError: (e: unknown) => {
            setTrackingError(toErrorString(e));
        },
        onSettled: (_result, _error, variables) => {
            setPendingDeviceUuids((prev) => {
                const next = new Set(prev);
                next.delete(variables.uuid);
                return next;
            });
        },
    });
    const serverIp = serverIpQuery.data ?? null;
    const showServerConfig = !!serverIp && !isChangingServer;
    const isChecking = checkMutation.isPending;

    const localDevice = useMemo(() => {
        const devices = devicesQuery.data ?? [];
        return devices.find((device: Device) => "Local" in device.state) ?? null;
    }, [devicesQuery.data]);

    const remoteDevices = useMemo(() => {
        const devices = devicesQuery.data ?? [];
        return devices.filter((device: Device) => {
            if (!("Remote" in device.state)) return false;
            if (device.available_on_server) return true;
            if (device.state.Remote.is_tracking) return true;
            return device.has_local_logs;
        });
    }, [devicesQuery.data]);

    const isRegistered = !!localDevice;

    useEffect(() => {
        if (isRegistered || deviceNameInitialized || !defaultDeviceNameQuery.data) return;
        setDeviceNameInput(defaultDeviceNameQuery.data);
        setDeviceNameInitialized(true);
    }, [defaultDeviceNameQuery.data, deviceNameInitialized, isRegistered]);

    useEffect(() => {
        if (!isRegistered) {
            setIsSyncing(false);
            setCountdownSeconds(null);
        }
    }, [isRegistered, setIsSyncing, setCountdownSeconds]);

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
        const name = deviceNameInput.trim();
        if (!name) {
            setRegisterError("Enter a device name");
            return;
        }
        setRegisterError(null);
        registerMutation.mutate(name);
    };

    const onOpenRegisterConfirm = () => {
        const name = deviceNameInput.trim();
        if (!name) {
            setRegisterError("Enter a device name");
            return;
        }
        setRegisterError(null);
        setShowRegisterConfirm(true);
    };

    if (serverIpQuery.isLoading) {
        return (
            <div className="p-6 text-white h-full overflow-y-auto nice-scrollbar">
                <div className="text-gray-400">Loading server settings...</div>
            </div>
        );
    }

    function changeServerClicked() {
        setIsChangingServer(true);
        setIpInput(serverIp ?? "");
    }

    function syncNowClicked() {
        if (syncNowMutation.isPending || isSyncing) return;
        syncNowMutation.mutate();
    }

    const syncCountdownLabel =
        isSyncing ? "Syncing…" : countdownSeconds !== null ? formatCountdown(countdownSeconds) : "—";

    return (
        <div className="p-6 text-white h-full overflow-y-auto nice-scrollbar">
            <div className="max-w-3xl mx-auto space-y-5">
                <h1 className="text-2xl font-bold">Sync</h1>

                {!showServerConfig ? (
                    <section className="bg-gray-900 rounded-lg border border-gray-800 p-5 space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Connect to server</h2>
                            <p className="text-sm text-gray-400 mt-1">
                                Enter your sync server IP to upload logs and pull from other devices.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={ipInput}
                                onChange={(e) => setIpInput(e.target.value)}
                                placeholder="Server IP"
                                className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white"
                            />
                            <button
                                type="button"
                                onClick={onCheck}
                                disabled={isChecking}
                                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 shrink-0"
                            >
                                {isChecking ? "Checking..." : "Connect"}
                            </button>
                        </div>
                    </section>
                ) : (
                    <>
                        <section className="bg-gray-900 rounded-lg border border-gray-800 p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                        Server
                                    </div>
                                    <div className="mt-1 font-mono text-sm truncate">{serverIp}</div>
                                </div>

                                {isRegistered ? (
                                    <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                                        <div className="text-right">
                                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                                Next sync
                                            </div>
                                            <div className="mt-1 font-mono text-2xl tabular-nums leading-none">
                                                {syncCountdownLabel}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={syncNowClicked}
                                            disabled={syncNowMutation.isPending || isSyncing}
                                            className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-60 text-sm font-medium whitespace-nowrap"
                                        >
                                            {syncNowMutation.isPending || isSyncing ? "Syncing..." : "Sync Now"}
                                        </button>
                                    </div>
                                ) : null}

                                <button
                                    type="button"
                                    onClick={changeServerClicked}
                                    className="px-3 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-800 shrink-0 self-start sm:self-center"
                                >
                                    Change server
                                </button>
                            </div>
                        </section>

                        <section className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-800">
                                <h2 className="text-lg font-semibold">Local device</h2>
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        isRegistered
                                            ? "bg-green-900/50 text-green-300"
                                            : "bg-red-900/50 text-red-300"
                                    }`}
                                >
                                    {isRegistered ? "Registered" : "Unregistered"}
                                </span>
                            </div>

                            <div className="px-5 py-4 space-y-4">
                                {isRegistered ? (
                                    <dl className="space-y-3">
                                        <div>
                                            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                                Device name
                                            </dt>
                                            <dd className="mt-0.5 font-medium">{localDevice?.name}</dd>
                                        </div>
                                        {localDevice ? (
                                            <div>
                                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                                    Local UUID
                                                </dt>
                                                <dd className="mt-0.5 text-sm font-mono text-gray-300 break-all">
                                                    {localDevice.uuid}
                                                </dd>
                                            </div>
                                        ) : null}
                                    </dl>
                                ) : (
                                    <>
                                        <div>
                                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 block mb-1.5">
                                                Device name
                                            </label>
                                            <input
                                                type="text"
                                                value={deviceNameInput}
                                                onChange={(e) => setDeviceNameInput(e.target.value)}
                                                placeholder={
                                                    defaultDeviceNameQuery.isLoading ? "Loading..." : "Device name"
                                                }
                                                disabled={
                                                    defaultDeviceNameQuery.isLoading || registerMutation.isPending
                                                }
                                                className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white disabled:opacity-60"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onOpenRegisterConfirm}
                                            disabled={
                                                registerMutation.isPending || !serverIp || !deviceNameInput.trim()
                                            }
                                            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-medium"
                                        >
                                            Register this device
                                        </button>
                                    </>
                                )}
                                {registerError ? (
                                    <div className="text-sm text-red-400">{registerError}</div>
                                ) : null}
                            </div>
                        </section>

                        <section className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-800">
                                <div>
                                    <h2 className="text-lg font-semibold">Other devices</h2>
                                    <p className="text-sm text-gray-400 mt-0.5">
                                        Subscribe to pull logs from other machines on the server.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => devicesQuery.refetch()}
                                    disabled={devicesQuery.isFetching || !serverIp}
                                    className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-60 text-sm shrink-0"
                                >
                                    {devicesQuery.isFetching ? "Refreshing..." : "Refresh"}
                                </button>
                            </div>

                            <div className="px-5 py-4">
                                {devicesQuery.isLoading ? (
                                    <div className="text-sm text-gray-400">Loading devices...</div>
                                ) : devicesQuery.isError ? (
                                    <div className="text-sm text-red-400">{toErrorString(devicesQuery.error)}</div>
                                ) : remoteDevices.length === 0 ? (
                                    <div className="text-sm text-gray-400">No other devices on the server yet.</div>
                                ) : (
                                    <ul className="divide-y divide-gray-800 rounded-lg border border-gray-800 overflow-hidden">
                                        {remoteDevices.map((device) => {
                                            const isTracking =
                                                "Remote" in device.state
                                                    ? device.state.Remote.is_tracking
                                                    : false;
                                            const canSubscribe = device.available_on_server && !isTracking;
                                            const canUnsubscribe =
                                                isTracking ||
                                                (!device.available_on_server && device.has_local_logs);
                                            const isPendingForDevice = pendingDeviceUuids.has(device.uuid);
                                            return (
                                                <li
                                                    key={device.uuid}
                                                    className="flex items-center justify-between gap-4 bg-gray-800/40 px-4 py-3"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="font-medium truncate">{device.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono truncate mt-0.5">
                                                            {device.uuid}
                                                        </div>
                                                        {!device.available_on_server && isTracking ? (
                                                            <div className="text-xs text-amber-400/90 mt-1">
                                                                No longer on server — tracking paused
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    {canSubscribe || canUnsubscribe ? (
                                                        <button
                                                            type="button"
                                                            disabled={isPendingForDevice}
                                                            onClick={() => {
                                                                if (canUnsubscribe) {
                                                                    setUnsubscribeConfirm({
                                                                        uuid: device.uuid,
                                                                        name: device.name,
                                                                    });
                                                                    return;
                                                                }
                                                                subscribeMutation.mutate({
                                                                    uuid: device.uuid,
                                                                    deviceName: device.name,
                                                                });
                                                            }}
                                                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                                                canUnsubscribe
                                                                    ? "bg-blue-600/20 border-blue-500/60 text-blue-300 hover:bg-blue-600/30"
                                                                    : "bg-gray-900 border-gray-600 text-gray-300 hover:bg-gray-800"
                                                            } disabled:opacity-60`}
                                                        >
                                                            {isPendingForDevice
                                                                ? canUnsubscribe
                                                                    ? "Unsubscribing..."
                                                                    : "Downloading..."
                                                                : canUnsubscribe
                                                                  ? isTracking
                                                                      ? "Subscribed"
                                                                      : "Remove logs"
                                                                  : "Subscribe"}
                                                        </button>
                                                    ) : null}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                                {trackingError ? (
                                    <div className="text-sm text-red-400 mt-3">{trackingError}</div>
                                ) : null}
                            </div>
                        </section>
                    </>
                )}

                {serverError ? <div className="text-sm text-red-400">{serverError}</div> : null}
            </div>

            {unsubscribeConfirm ? (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white">Unsubscribe from device?</h3>
                        <p className="text-gray-300 mb-4">
                            This will stop syncing from{" "}
                            <span className="font-medium text-white">{unsubscribeConfirm.name}</span> and delete all
                            of its logs stored on this machine.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => setUnsubscribeConfirm(null)}
                                disabled={unsubscribeMutation.isPending}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => unsubscribeMutation.mutate({uuid: unsubscribeConfirm.uuid})}
                                disabled={unsubscribeMutation.isPending}
                                className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white disabled:opacity-50"
                            >
                                {unsubscribeMutation.isPending ? "Unsubscribing..." : "Unsubscribe"}
                            </button>
                        </div>
                        {trackingError ? <div className="text-sm text-red-400 mt-4">{trackingError}</div> : null}
                    </div>
                </div>
            ) : null}

            {showRegisterConfirm ? (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4 text-white">Register this device?</h3>
                        <p className="text-gray-300 mb-4">
                            Registering means uploading your logs to the server as{" "}
                            <span className="font-medium text-white">{deviceNameInput.trim()}</span>.
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
