import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export default function DevView() {
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const checkUpdate = async () => {
        setChecking(true);
        setResult(null);
        try {
            const hasUpdate = await invoke<boolean>("check_update_cmd");
            setResult(hasUpdate ? "Update available" : "No update available");
        } catch (e) {
            setResult(String(e));
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="p-6 max-w-2xl">
            <div className="text-lg font-semibold mb-4">Dev</div>
            <div className="flex items-center gap-3">
                <button
                    onClick={checkUpdate}
                    disabled={checking}
                    className="px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-60"
                >
                    {checking ? "Checking..." : "Check for update"}
                </button>
            </div>
            {result && <div className="mt-4 text-sm text-gray-300">{result}</div>}
        </div>
    );
}

