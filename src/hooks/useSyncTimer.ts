import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";

export function useSyncTimer() {
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        let unlistenCountdown: (() => void) | null = null;
        let unlistenSyncStarted: (() => void) | null = null;
        let unlistenSyncSuccessful: (() => void) | null = null;
        let unlistenSyncError: (() => void) | null = null;

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
            unlistenSyncSuccessful = await listen("sync-successful", () => {
                setIsSyncing(false);
            });
            unlistenSyncError = await listen("sync-error", () => {
                setIsSyncing(false);
            });
        };

        void setup();

        return () => {
            if (unlistenCountdown) unlistenCountdown();
            if (unlistenSyncStarted) unlistenSyncStarted();
            if (unlistenSyncSuccessful) unlistenSyncSuccessful();
            if (unlistenSyncError) unlistenSyncError();
        };
    }, []);

    return {countdownSeconds, isSyncing, setCountdownSeconds, setIsSyncing};
}
