import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
    get_google_calendars,
    insert_google_calendar,
    delete_google_calendar,
    google_oauth_login,
    google_oauth_logout,
    get_google_auth_status,
    list_available_google_calendars,
    hasGoogleOAuthCredentials,
    GoogleCalendar,
    GoogleCalendarInfo,
    NewGoogleCalendar,
} from "../api/GoogleCalendar.ts";
import { unwrapResult } from "../utils.ts";
import { useToast } from "../Componants/Toast.tsx";
import { getErrorMessage } from "../types/common.ts";

export default function GoogleCalendarsView() {
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const { data: authStatus, refetch: refetchAuthStatus } = useQuery({
        queryKey: ["googleAuthStatus"],
        queryFn: async () => {
            const result = await get_google_auth_status();
            return unwrapResult(result);
        },
    });

    const { data: calendars = [] } = useQuery({
        queryKey: ["googleCalendars"],
        queryFn: async () => {
            const result = await get_google_calendars();
            return unwrapResult(result);
        },
    });

    const { data: availableCalendars = [], refetch: refetchAvailableCalendars } = useQuery({
        queryKey: ["availableGoogleCalendars"],
        queryFn: async () => {
            const result = await list_available_google_calendars();
            return unwrapResult(result);
        },
        enabled: authStatus?.logged_in === true,
    });

    const handleLogin = async () => {
        if (!hasGoogleOAuthCredentials()) {
            showToast("OAuth credentials not configured. Please contact the app developer.", "error");
            return;
        }
        setIsLoggingIn(true);
        try {
            const result = await google_oauth_login();
            if (result.success) {
                showToast(`Logged in as ${result.data.email}`, "success");

                await queryClient.invalidateQueries({ queryKey: ["googleAuthStatus"] });
                await refetchAuthStatus();

                await new Promise(resolve => setTimeout(resolve, 500));

                const availableResult = await list_available_google_calendars();
                if (availableResult.success && availableResult.data) {
                    const calendarsToAdd = availableResult.data.filter(cal => !cal.selected);
                    if (calendarsToAdd.length > 0) {
                        const authStatusResult = await get_google_auth_status();
                        if (authStatusResult.success && authStatusResult.data?.email) {
                            let importedCount = 0;
                            for (const cal of calendarsToAdd) {
                                try {
                                    const newCal: NewGoogleCalendar = {
                                        google_calendar_id: cal.google_calendar_id,
                                        name: cal.name,
                                        color: cal.color,
                                        account_email: authStatusResult.data.email,
                                    };
                                    const insertResult = await insert_google_calendar(newCal);
                                    if (insertResult.success) {
                                        importedCount++;
                                    }
                                } catch (e) {
                                }
                            }
                            queryClient.invalidateQueries({ queryKey: ["googleCalendars"] });
                            queryClient.invalidateQueries({ queryKey: ["availableGoogleCalendars"] });
                            queryClient.invalidateQueries({
                                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
                            });
                            if (importedCount > 0) {
                                showToast(`Imported ${importedCount} calendar(s)`, "success");
                            }
                        }
                    }
                }
                await refetchAvailableCalendars();
            } else {
                console.error("Login failed:", result.error);
                const fullError = JSON.stringify(result.error, null, 2);
                showToast("Login failed", "error", 5000, fullError);
            }
        } catch (error: any) {
            console.error("Login error:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Login error", "error", 5000, fullError);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const logoutMutation = useMutation({
        mutationFn: async () => {
            return unwrapResult(await google_oauth_logout());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["googleAuthStatus"] });
            queryClient.invalidateQueries({ queryKey: ["googleCalendars"] });
            queryClient.invalidateQueries({ queryKey: ["availableGoogleCalendars"] });
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            showToast("Logged out successfully", "success");
        },
        onError: (error: any) => {
            console.error("Logout failed:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Logout failed", "error", 5000, fullError);
        },
    });

    const addCalendarMutation = useMutation({
        mutationFn: async (calendarInfo: GoogleCalendarInfo) => {
            if (!authStatus?.email) throw new Error("Not logged in");
            const newCal: NewGoogleCalendar = {
                google_calendar_id: calendarInfo.google_calendar_id,
                name: calendarInfo.name,
                color: calendarInfo.color,
                account_email: authStatus.email,
            };
            return unwrapResult(await insert_google_calendar(newCal));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["googleCalendars"] });
            queryClient.invalidateQueries({ queryKey: ["availableGoogleCalendars"] });
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            showToast("Calendar added", "success");
        },
        onError: (error: any) => {
            console.error("Failed to add calendar:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to add calendar", "error", 5000, fullError);
        },
    });

    const removeCalendarMutation = useMutation({
        mutationFn: async (id: number) => {
            return unwrapResult(await delete_google_calendar(id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["googleCalendars"] });
            queryClient.invalidateQueries({ queryKey: ["availableGoogleCalendars"] });
            queryClient.invalidateQueries({
                predicate: (query) => query.queryKey[0] === "googleCalendarEvents"
            });
            showToast("Calendar removed", "success");
        },
        onError: (error: any) => {
            console.error("Failed to remove calendar:", error);
            const fullError = JSON.stringify(error, null, 2);
            showToast("Failed to remove calendar", "error", 5000, fullError);
        },
    });

    const handleToggleCalendar = (calendarInfo: GoogleCalendarInfo) => {
        if (calendarInfo.selected) {
            const calendar = calendars.find(c => c.google_calendar_id === calendarInfo.google_calendar_id);
            if (calendar) {
                removeCalendarMutation.mutate(calendar.id);
            }
        } else {
            addCalendarMutation.mutate(calendarInfo);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Google Calendar Integration</h1>

            <div className="bg-gray-900 rounded-lg p-6 mb-6">
                {authStatus?.logged_in ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-white mb-1">Connected</h2>
                                <p className="text-green-400">✓ Logged in as {authStatus.email}</p>
                            </div>
                            <button
                                onClick={() => logoutMutation.mutate()}
                                disabled={logoutMutation.isPending}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-white"
                            >
                                {logoutMutation.isPending ? "Logging out..." : "Disconnect"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <h2 className="text-2xl font-semibold text-white mb-3">Connect Your Google Calendar</h2>
                        <p className="text-gray-400 mb-6">View, edit, and manage your Google Calendar events</p>
                        <button
                            onClick={handleLogin}
                            disabled={isLoggingIn || !hasGoogleOAuthCredentials()}
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold text-lg transition-colors"
                        >
                            {isLoggingIn ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin">⏳</span>
                                    Connecting...
                                </span>
                            ) : (
                                "Sign in with Google"
                            )}
                        </button>
                        <p className="text-sm text-gray-500 mt-4">
                            Click to sign in via your browser. You'll stay logged in until you disconnect.
                        </p>
                        {!hasGoogleOAuthCredentials() && (
                            <p className="text-sm text-red-400 mt-2">
                                OAuth credentials not configured. Please contact the app developer.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {!authStatus?.logged_in && !hasGoogleOAuthCredentials() && (
                <div className="bg-red-900/20 border-2 border-red-600 rounded-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold text-red-400 mb-2">⚠️ Developer Setup Required</h3>
                    <p className="text-gray-300 mb-4">
                        OAuth credentials need to be embedded in the app code. This is a <strong>one-time developer setup</strong> -
                        once configured, all users can just click "Connect Google Account" without any setup.
                    </p>
                    <details className="mt-4">
                        <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300 mb-3">
                            Show developer setup instructions
                        </summary>
                        <div className="space-y-4 pt-4 border-t border-gray-700">
                            <div className="p-4 bg-gray-800 rounded">
                                <p className="text-sm text-gray-300 mb-3 font-medium">📋 Steps:</p>
                                <ol className="text-sm text-gray-400 list-decimal list-inside space-y-2">
                                    <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a></li>
                                    <li>Create a project and enable "Google Calendar API"</li>
                                    <li>Create OAuth 2.0 credentials (Desktop app type)</li>
                                    <li>Add redirect URI: <code className="bg-gray-900 px-1 rounded text-xs">http://localhost:8742/oauth/callback</code></li>
                                    <li>Open <code className="bg-gray-900 px-1 rounded text-xs">src/api/GoogleCalendar.ts</code></li>
                                    <li>Replace <code className="bg-gray-900 px-1 rounded text-xs">YOUR_DEFAULT_CLIENT_ID_HERE</code> and <code className="bg-gray-900 px-1 rounded text-xs">YOUR_DEFAULT_CLIENT_SECRET_HERE</code> with your actual credentials</li>
                                    <li>Rebuild the app - all users can now just click "Connect Google Account"!</li>
                                </ol>
                            </div>
                            <div className="p-3 bg-blue-900/20 border border-blue-700 rounded">
                                <p className="text-xs text-blue-300">
                                    💡 <strong>Note:</strong> These credentials are embedded in your app. All users will use them automatically.
                                    No license needed - this is standard OAuth for desktop apps.
                                </p>
                            </div>
                        </div>
                    </details>
                </div>
            )}

            {authStatus?.logged_in && (
                <div className="bg-gray-900 rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Select Calendars to Display</h2>

                    {availableCalendars.length === 0 ? (
                        <p className="text-gray-400">No calendars found</p>
                    ) : (
                        <div className="space-y-2">
                            {availableCalendars.map((cal) => (
                                <div
                                    key={cal.google_calendar_id}
                                    className="flex items-center gap-3 p-3 bg-gray-800 rounded hover:bg-gray-750"
                                >
                                    <input
                                        type="checkbox"
                                        checked={cal.selected}
                                        onChange={() => handleToggleCalendar(cal)}
                                        disabled={addCalendarMutation.isPending || removeCalendarMutation.isPending}
                                        className="w-4 h-4"
                                    />
                                    <div
                                        className="w-4 h-4 rounded"
                                        style={{ backgroundColor: cal.color }}
                                    />
                                    <div className="flex-1">
                                        <div className="text-white">{cal.name}</div>
                                        <div className="text-xs text-gray-400">{cal.access_role}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
