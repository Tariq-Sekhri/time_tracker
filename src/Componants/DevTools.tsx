import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get_logs } from "../api/Log.ts";
import { unwrapResult, invokeWithResult } from "../utils.ts";
import { listen } from "@tauri-apps/api/event";

type DevToolsTab = "logs" | "danger";

export default function DevTools() {
    const [activeTab, setActiveTab] = useState<DevToolsTab>("logs");

    useEffect(() => {
        const unlisten = listen("BackgroundProcessError", e => console.error(e.payload));
        return () => { unlisten.then(fn => fn()); };
    }, []);

    const tabs: { id: DevToolsTab; label: string; color: string }[] = [
        { id: "logs", label: "Logs Overview", color: "bg-orange-600" },
        { id: "danger", label: "Danger Zone", color: "bg-red-600" },
    ];

    return (
        <div className="h-full flex flex-col">
            {/* Sub-navigation */}
            <div className="flex border-b border-gray-700 bg-gray-900">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 font-medium transition-colors ${activeTab === tab.id
                                ? `${tab.color} text-white`
                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === "logs" && <LogsOverviewTab />}
                {activeTab === "danger" && <DangerZoneTab />}
            </div>
        </div>
    );
}

// ==================== LOGS OVERVIEW TAB ====================
function LogsOverviewTab() {
    const [displayText, setDisplayText] = useState<string>("");

    const { data: logs = [], isLoading } = useQuery({
        queryKey: ["logs"],
        queryFn: async () => unwrapResult(await get_logs()),
    });

    async function getAllData() {
        const result = await invokeWithResult<any>("get_all_db_data");
        if (result.success) {
            // Reorder data so logs come last
            const reorderedData = {
                categories: result.data.categories,
                category_regex: result.data.category_regex,
                skipped_apps: result.data.skipped_apps,
                logs: result.data.logs,
            };
            setDisplayText(JSON.stringify(reorderedData, null, 2));
        } else {
            setDisplayText(JSON.stringify(result.error, null, 2));
        }
    }

    async function getLogsOnly() {
        setDisplayText(JSON.stringify(logs, null, 2));
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(displayText);
        } catch (error) {
            console.error("Failed to copy to clipboard:", error);
        }
    }

    if (isLoading) return <div className="text-white">Loading logs...</div>;

    return (
        <div className="text-white">
            {/* Database Overview Section */}
            <div className="bg-gray-900 rounded-lg p-6">
                <h2 className="text-2xl font-bold mb-4">Database Overview</h2>
                <div className="flex gap-3 mb-4">
                    <button
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                        onClick={getAllData}
                    >
                        Get All Data
                    </button>
                    <button
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded transition-colors"
                        onClick={getLogsOnly}
                    >
                        Get Logs
                    </button>
                    <button
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex items-center gap-2 transition-colors"
                        onClick={copyToClipboard}
                        disabled={!displayText}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                    </button>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-[70vh] text-gray-300">{displayText || "Click a button above to view data"}</pre>
                </div>
            </div>
        </div>
    );
}


// ==================== DANGER ZONE TAB ====================
function DangerZoneTab() {
    const queryClient = useQueryClient();
    const [confirmStep, setConfirmStep] = useState(0);
    const [isWiping, setIsWiping] = useState(false);

    const handleWipeClick = () => {
        if (confirmStep === 0) {
            setConfirmStep(1);
        } else if (confirmStep === 1) {
            setConfirmStep(2);
        } else if (confirmStep === 2) {
            performWipe();
        }
    };

    const performWipe = async () => {
        setIsWiping(true);
        try {
            const result = await invokeWithResult("wipe_all_data");
            if (result.success) {
                queryClient.invalidateQueries();
                setConfirmStep(0);
                alert("All data has been wiped. Default values have been restored.");
            } else {
                alert("Failed to wipe data: " + JSON.stringify(result.error));
            }
        } catch (error) {
            alert("Error wiping data: " + error);
        }
        setIsWiping(false);
    };

    const cancelWipe = () => {
        setConfirmStep(0);
    };

    return (
        <div className="text-white">
            <h2 className="text-2xl font-bold mb-4 text-red-500">⚠️ Danger Zone</h2>

            <div className="p-6 bg-red-900/20 border border-red-700 rounded-lg">
                <h3 className="text-xl font-bold mb-2">Wipe All Data</h3>
                <p className="text-gray-300 mb-4">
                    This will permanently delete all logs, categories, regex patterns, and skipped apps.
                    Default categories and skipped apps will be restored.
                </p>
                <p className="text-red-400 font-semibold mb-4">
                    ⚠️ This action cannot be undone!
                </p>

                {confirmStep === 0 && (
                    <button
                        onClick={handleWipeClick}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded font-medium"
                    >
                        Wipe All Data
                    </button>
                )}

                {confirmStep === 1 && (
                    <div className="space-y-3">
                        <p className="text-yellow-400 font-medium">
                            Are you sure? This will delete ALL your tracking data permanently.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleWipeClick}
                                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded font-medium"
                            >
                                Yes, I'm Sure
                            </button>
                            <button
                                onClick={cancelWipe}
                                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {confirmStep === 2 && (
                    <div className="space-y-3">
                        <p className="text-red-400 font-bold text-lg">
                            FINAL WARNING: This is your last chance to cancel!
                        </p>
                        <p className="text-gray-300">
                            Click "WIPE EVERYTHING" to permanently delete all data.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleWipeClick}
                                disabled={isWiping}
                                className="px-6 py-3 bg-red-700 hover:bg-red-800 rounded font-bold disabled:opacity-50"
                            >
                                {isWiping ? "Wiping..." : "WIPE EVERYTHING"}
                            </button>
                            <button
                                onClick={cancelWipe}
                                disabled={isWiping}
                                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded font-medium disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
