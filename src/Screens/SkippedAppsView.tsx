import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {
    get_skipped_apps,
    insert_skipped_app_and_delete_logs,
    delete_skipped_app_by_id,
    update_skipped_app_by_id,
    count_matching_logs,
    SkippedApp,
    NewSkippedApp
} from "../api/SkippedApp.ts";
import {unwrapResult} from "../utils.ts";
import {getErrorMessage} from "../types/common.ts";
import {ToastContainer, useToast} from "../Componants/Toast.tsx";

// Validate regex pattern - returns error message or null if valid
// Note: Rust regex supports (?i) for case-insensitive, but JS doesn't, so we validate without flags
function validateRegex(pattern: string): string | null {
    if (!pattern.trim()) {
        return "Pattern cannot be empty";
    }
    try {
        // Remove Rust-specific flags like (?i) for validation, then add them back
        // Rust regex uses (?i) for case-insensitive, (?m) for multiline, etc.
        let testPattern = pattern;

        // Remove Rust regex flags at the start: (?i), (?m), (?s), (?x), (?U), etc.
        testPattern = testPattern.replace(/^\(\?[imsxU]+\)/, '');

        // Also handle flags in the middle (less common but possible)
        testPattern = testPattern.replace(/\(\?[imsxU]+\)/g, '');

        // Now validate the pattern without flags using JS RegExp
        new RegExp(testPattern);
        return null;
    } catch (e) {
        return `Invalid regex: ${e instanceof Error ? e.message : "Unknown error"}`;
    }
}

export default function SkippedAppsView() {
    const queryClient = useQueryClient();
    const {toasts, showToast, removeToast, updateToast} = useToast();
    const [newRegexPattern, setNewRegexPattern] = useState("");
    const [regexError, setRegexError] = useState<string | null>(null);
    const [editingApp, setEditingApp] = useState<SkippedApp | null>(null);
    const [editRegexError, setEditRegexError] = useState<string | null>(null);

    // Confirmation dialog state
    const [pendingRegex, setPendingRegex] = useState<string | null>(null);
    const [matchingLogCount, setMatchingLogCount] = useState<number>(0);
    const [isCountingLogs, setIsCountingLogs] = useState(false);

    const {data: skippedApps = []} = useQuery({
        queryKey: ["skipped_apps"],
        queryFn: async () => unwrapResult(await get_skipped_apps()),
    });

    const createSkippedAppMutation = useMutation({
        mutationFn: async (newApp: NewSkippedApp) => {
            const result = await insert_skipped_app_and_delete_logs(newApp);
            if (!result.success) {
                throw new Error(getErrorMessage(result.error));
            }
            return result.data;
        },
        onMutate: async (newApp) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({queryKey: ["skipped_apps"]});

            // Snapshot previous value
            const previousApps = queryClient.getQueryData<SkippedApp[]>(["skipped_apps"]);

            // Optimistically add to the list
            const optimisticApp: SkippedApp = {
                id: Date.now(), // Temporary ID
                regex: newApp.regex,
            };

            queryClient.setQueryData<SkippedApp[]>(["skipped_apps"], (old = []) => {
                return [...old, optimisticApp].sort((a, b) => a.regex.localeCompare(b.regex));
            });

            // Show loading toast
            const toastId = showToast(`Adding pattern "${newApp.regex}"...`, "loading", 0);

            return {previousApps, toastId};
        },
        onSuccess: (_data, variables, context) => {
            // Update toast to success
            if (context?.toastId) {
                updateToast(context.toastId, `Pattern "${variables.regex}" added successfully`, "success");
                setTimeout(() => removeToast(context.toastId!), 2000);
            }

            // Invalidate to get real data
            queryClient.invalidateQueries({queryKey: ["skipped_apps"]});
            queryClient.invalidateQueries({queryKey: ["week"]});
            setNewRegexPattern("");
            setPendingRegex(null);
            setMatchingLogCount(0);
        },
        onError: (error, _variables, context) => {
            // Rollback optimistic update
            if (context?.previousApps) {
                queryClient.setQueryData(["skipped_apps"], context.previousApps);
            }

            // Update toast to error
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (context?.toastId) {
                updateToast(context.toastId, `Failed to add pattern: ${errorMsg}`, "error");
            } else {
                showToast(`Failed to add pattern: ${errorMsg}`, "error");
            }

            setRegexError("Failed to add pattern: " + errorMsg);
            setPendingRegex(null);
        },
    });

    const updateSkippedAppMutation = useMutation({
        mutationFn: async (app: SkippedApp) => {
            return unwrapResult(await update_skipped_app_by_id(app));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["skipped_apps"]});
            setEditingApp(null);
            setEditRegexError(null);
        },
    });

    const deleteSkippedAppMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_skipped_app_by_id(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["skipped_apps"]});
        },
    });

    const handleCheckAndAdd = async () => {
        const error = validateRegex(newRegexPattern);
        if (error) {
            setRegexError(error);
            return;
        }
        setRegexError(null);

        // Count matching logs first
        setIsCountingLogs(true);
        try {
            const result = await count_matching_logs(newRegexPattern);
            if (result.success) {
                setMatchingLogCount(result.data);
                setPendingRegex(newRegexPattern);
            } else {
                setRegexError(getErrorMessage(result.error));
            }
        } catch (e) {
            setRegexError("Failed to count matching logs");
        }
        setIsCountingLogs(false);
    };

    const handleConfirmAdd = () => {
        if (pendingRegex) {
            createSkippedAppMutation.mutate({regex: pendingRegex});
        }
    };

    const handleCancelAdd = () => {
        setPendingRegex(null);
        setMatchingLogCount(0);
    };

    const handleUpdateApp = (app: SkippedApp) => {
        const error = validateRegex(app.regex);
        if (error) {
            setEditRegexError(error);
            return;
        }
        setEditRegexError(null);
        updateSkippedAppMutation.mutate(app);
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({queryKey: ["skipped_apps"]});
    };

    return (
        <div className="p-6 text-white">
            <ToastContainer toasts={toasts} onRemove={removeToast}/>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Skipped Apps</h1>
                <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    Refresh
                </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
                Apps matching these regex patterns will not be tracked. Use regex patterns like <code
                className="bg-gray-800 px-1 rounded">^Chrome$</code> for exact match or <code
                className="bg-gray-800 px-1 rounded">.*Discord.*</code> for partial match.
            </p>

            {/* Add New Skipped App */}
            <div className="mb-4 p-4 bg-gray-900 rounded-lg">
                <h3 className="text-lg font-medium mb-3">Add Skipped App Pattern</h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="Regex pattern (e.g., ^Chrome$ or .*Discord.*)"
                        value={newRegexPattern}
                        onChange={(e) => {
                            setNewRegexPattern(e.target.value);
                            setRegexError(null);
                        }}
                        className={`flex-1 px-3 py-2 bg-gray-800 border rounded text-white ${regexError ? 'border-red-500' : 'border-gray-700'}`}
                    />
                    <button
                        onClick={handleCheckAndAdd}
                        disabled={isCountingLogs}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                    >
                        {isCountingLogs ? "Checking..." : "Add"}
                    </button>
                </div>
                {regexError && (
                    <div className="mt-2 text-red-400 text-sm">{regexError}</div>
                )}
            </div>

            {/* Confirmation Dialog */}
            {pendingRegex && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4 border border-gray-700">
                        <h3 className="text-xl font-bold mb-4">Confirm Add Pattern</h3>
                        <p className="text-gray-300 mb-2">
                            Pattern: <code className="bg-gray-800 px-2 py-1 rounded">{pendingRegex}</code>
                        </p>
                        <p className="text-gray-300 mb-4">
                            This will <span
                            className="text-red-400 font-semibold">permanently delete {matchingLogCount} log{matchingLogCount !== 1 ? 's' : ''}</span> that
                            match this pattern.
                        </p>
                        {matchingLogCount > 0 && (
                            <p className="text-yellow-400 text-sm mb-4">
                                ⚠️ This action cannot be undone!
                            </p>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleCancelAdd}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAdd}
                                disabled={createSkippedAppMutation.isPending}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
                            >
                                {createSkippedAppMutation.isPending ? "Adding..." : "Delete Logs & Add Pattern"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Skipped Apps List */}
            <div className="space-y-2">
                {skippedApps.map((app) => (
                    <div key={app.id} className="p-4 bg-gray-900 rounded-lg">
                        {editingApp?.id === app.id ? (
                            <div className="space-y-2">
                                <div className="flex gap-3 items-center">
                                    <input
                                        type="text"
                                        value={editingApp.regex}
                                        onChange={(e) => {
                                            setEditingApp({...editingApp, regex: e.target.value});
                                            setEditRegexError(null);
                                        }}
                                        className={`flex-1 px-3 py-2 bg-gray-800 border rounded text-white ${editRegexError ? 'border-red-500' : 'border-gray-700'}`}
                                    />
                                    <button
                                        onClick={() => handleUpdateApp(editingApp)}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingApp(null);
                                            setEditRegexError(null);
                                        }}
                                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                                    >
                                        Cancel
                                    </button>
                                </div>
                                {editRegexError && (
                                    <div className="text-red-400 text-sm">{editRegexError}</div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <div>
                                    <code className="font-medium text-gray-200 bg-gray-800 px-2 py-1 rounded">
                                        {app.regex || "(empty)"}
                                    </code>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditingApp(app)}
                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => deleteSkippedAppMutation.mutate(app.id)}
                                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
