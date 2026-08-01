import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {
    AppGroup,
    delete_app_group,
    get_app_groups,
    insert_app_group,
    update_app_group,
} from "../api/AppGroup.ts";
import {useToast} from "../Componants/Toast.tsx";
import {toErrorString} from "../types/common.ts";

function validate(name: string, pattern: string): string | null {
    if (!name.trim()) return "Group name cannot be empty";
    if (!pattern.trim()) return "Regex pattern cannot be empty";
    try {
        const caseInsensitive = pattern.startsWith("(?i)");
        new RegExp(caseInsensitive ? pattern.slice(4) : pattern, caseInsensitive ? "i" : undefined);
        return null;
    } catch (error) {
        return `Invalid regex: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
}

export default function AppGroupsView() {
    const queryClient = useQueryClient();
    const {showToast} = useToast();
    const [name, setName] = useState("");
    const [pattern, setPattern] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [editing, setEditing] = useState<AppGroup | null>(null);
    const [editError, setEditError] = useState<string | null>(null);

    const {data: groups = [], isLoading, refetch} = useQuery({
        queryKey: ["app_groups"],
        queryFn: get_app_groups,
    });

    const invalidateAppViews = async () => {
        await Promise.all([
            queryClient.invalidateQueries({queryKey: ["app_groups"]}),
            queryClient.invalidateQueries({queryKey: ["week"]}),
            queryClient.invalidateQueries({queryKey: ["week_statistics"]}),
            queryClient.invalidateQueries({queryKey: ["total_statistics"]}),
            queryClient.invalidateQueries({queryKey: ["range_statistics"]}),
            queryClient.invalidateQueries({queryKey: ["day_statistics"]}),
            queryClient.invalidateQueries({queryKey: ["category_app_logs"]}),
            queryClient.invalidateQueries({queryKey: ["week_app_filter"]}),
        ]);
    };

    const createMutation = useMutation({
        mutationFn: insert_app_group,
        onSuccess: async () => {
            setName("");
            setPattern("");
            setFormError(null);
            await invalidateAppViews();
            showToast("App group created", "success");
        },
        onError: (error) => showToast("Failed to create app group", "error", 5000, toErrorString(error)),
    });

    const updateMutation = useMutation({
        mutationFn: update_app_group,
        onSuccess: async () => {
            setEditing(null);
            setEditError(null);
            await invalidateAppViews();
            showToast("App group updated", "success");
        },
        onError: (error) => showToast("Failed to update app group", "error", 5000, toErrorString(error)),
    });

    const deleteMutation = useMutation({
        mutationFn: delete_app_group,
        onSuccess: async () => {
            await invalidateAppViews();
            showToast("App group deleted", "success");
        },
        onError: (error) => showToast("Failed to delete app group", "error", 5000, toErrorString(error)),
    });

    const createGroup = () => {
        const error = validate(name, pattern);
        if (error) {
            setFormError(error);
            return;
        }
        createMutation.mutate({name: name.trim(), regex: pattern.trim()});
    };

    const saveEdit = () => {
        if (!editing) return;
        const error = validate(editing.name, editing.regex);
        if (error) {
            setEditError(error);
            return;
        }
        updateMutation.mutate({...editing, name: editing.name.trim(), regex: editing.regex.trim()});
    };

    return (
        <div className="p-6 text-white [color-scheme:dark]">
            <div className="flex items-center justify-between gap-4 mb-2">
                <h1 className="text-3xl font-bold">App Groups</h1>
                <button
                    onClick={() => void refetch()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                >
                    Refresh
                </button>
            </div>
            <p className="text-sm text-gray-400 mb-6 max-w-4xl">
                Treat changing window titles as one app in calendars and statistics. The display name is shown in
                Top Apps, while the regex matches the original recorded title. Existing logs are grouped immediately.
                If rules overlap, the most specific matching regex wins.
            </p>

            <div className="p-4 bg-gray-900 rounded-lg mb-6">
                <h2 className="text-lg font-medium mb-3">Add app group</h2>
                <div className="grid grid-cols-1 md:grid-cols-[minmax(10rem,0.45fr)_minmax(16rem,1fr)_auto] gap-3">
                    <input
                        value={name}
                        onChange={(event) => {
                            setName(event.target.value);
                            setFormError(null);
                        }}
                        placeholder="Display name (for example, YouTube)"
                        className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    />
                    <input
                        value={pattern}
                        onChange={(event) => {
                            setPattern(event.target.value);
                            setFormError(null);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") createGroup();
                        }}
                        placeholder="Regex (for example, (?i)youtube)"
                        className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white font-mono"
                    />
                    <button
                        onClick={createGroup}
                        disabled={createMutation.isPending}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                    >
                        {createMutation.isPending ? "Adding..." : "Add"}
                    </button>
                </div>
                {formError && <div className="text-sm text-red-400 mt-2">{formError}</div>}
            </div>

            {isLoading ? (
                <div className="text-gray-500">Loading app groups...</div>
            ) : groups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center text-gray-500">
                    No app groups yet. Add YouTube with <span className="font-mono text-gray-300">(?i)youtube</span> to
                    combine video titles from Vivaldi or another browser.
                </div>
            ) : (
                <div className="space-y-2">
                    {groups.map((group) => (
                        <div key={group.id} className="bg-gray-900 rounded-lg p-4">
                            {editing?.id === group.id ? (
                                <div>
                                    <div className="grid grid-cols-1 md:grid-cols-[minmax(10rem,0.45fr)_minmax(16rem,1fr)_auto_auto] gap-3">
                                        <input
                                            value={editing.name}
                                            onChange={(event) => {
                                                setEditing({...editing, name: event.target.value});
                                                setEditError(null);
                                            }}
                                            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                                        />
                                        <input
                                            value={editing.regex}
                                            onChange={(event) => {
                                                setEditing({...editing, regex: event.target.value});
                                                setEditError(null);
                                            }}
                                            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white font-mono"
                                        />
                                        <button onClick={saveEdit} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded">
                                            Save
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditing(null);
                                                setEditError(null);
                                            }}
                                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                    {editError && <div className="text-sm text-red-400 mt-2">{editError}</div>}
                                </div>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium truncate">{group.name}</div>
                                        <div className="font-mono text-sm text-gray-400 truncate" title={group.regex}>
                                            {group.regex}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setEditing({...group});
                                            setEditError(null);
                                        }}
                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => deleteMutation.mutate(group.id)}
                                        disabled={deleteMutation.isPending}
                                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm disabled:opacity-50"
                                    >
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
