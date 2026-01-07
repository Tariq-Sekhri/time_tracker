import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
    get_skipped_apps,
    insert_skipped_app,
    delete_skipped_app_by_id,
    SkippedApp,
    NewSkippedApp
} from "../api/SkippedApp.ts";
import { unwrapResult } from "../utils.ts";

export default function SkippedAppsView() {
    const queryClient = useQueryClient();
    const [newSkippedAppName, setNewSkippedAppName] = useState("");

    const { data: skippedApps = [] } = useQuery({
        queryKey: ["skipped_apps"],
        queryFn: async () => unwrapResult(await get_skipped_apps()),
    });

    const createSkippedAppMutation = useMutation({
        mutationFn: async (newApp: NewSkippedApp) => {
            return unwrapResult(await insert_skipped_app(newApp));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
            setNewSkippedAppName("");
        },
    });

    const deleteSkippedAppMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_skipped_app_by_id(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
        },
    });

    const handleCreateSkippedApp = () => {
        if (newSkippedAppName.trim()) {
            createSkippedAppMutation.mutate({
                app_name: newSkippedAppName.trim(),
            });
        }
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ["skipped_apps"] });
    };

    return (
        <div className="p-6 text-white">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Skipped Apps</h1>
                <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
                Apps in this list will not be tracked. These are typically system windows and dialogs.
                When a skipped app is encountered, it will be automatically removed from this list.
            </p>

            {/* Add New Skipped App */}
            <div className="mb-4 p-4 bg-gray-900 rounded-lg">
                <h3 className="text-lg font-medium mb-3">Add Skipped App</h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="App name (exact match)"
                        value={newSkippedAppName}
                        onChange={(e) => setNewSkippedAppName(e.target.value)}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    />
                    <button
                        onClick={handleCreateSkippedApp}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                    >
                        Add
                    </button>
                </div>
            </div>

            {/* Skipped Apps List */}
            <div className="space-y-2">
                {skippedApps.map((app) => (
                    <div key={app.id} className="p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                        <div>
                            <span className="font-medium text-gray-200">{app.app_name || "(empty)"}</span>
                        </div>
                        <button
                            onClick={() => deleteSkippedAppMutation.mutate(app.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

