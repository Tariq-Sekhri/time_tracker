import {invokeOrThrow as invoke} from "../utils.ts";
import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {View} from "../App.tsx"


export default function Header({currentView, setCurrentView, notesEnabled}: {
    currentView: View,
    setCurrentView: (newView: View) => void,
    notesEnabled: boolean,
}) {
    const [isTracking, setIsTracking] = useState(true);
    const [appVersion, setAppVersion] = useState<string | null>(null);
    const isDev = appVersion?.endsWith("-dev") ?? false;
    const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "upToDate" | "available" | "error" | "applying">("idle");
    const appRuleViews: {view: View; label: string}[] = [
        {view: "categories", label: "Categories"},
        {view: "regex", label: "Regex"},
        {view: "appGroups", label: "App Groups"},
        {view: "skipped", label: "Skipped Apps"},
    ];
    const isAppRulesView = appRuleViews.some(({view}) => currentView === view);
    useEffect(() => {
        invoke<boolean>("get_tracking_status").then(setIsTracking);
    }, []);

    useEffect(() => {
        invoke<string>("get_app_version").then(setAppVersion).catch(() => setAppVersion(null));
    }, []);


    useEffect(() => {
        let unlistenFn: (() => void) | null = null;

        const setupListener = async () => {
            const unlisten = await listen<boolean>("tracking-status-changed", (event) => {
                setIsTracking(event.payload);
            });
            unlistenFn = unlisten;
        };

        setupListener();

        return () => {
            if (unlistenFn) {
                unlistenFn();
            }
        };
    }, []);

    const toggleTracking = async () => {
        const newStatus = !isTracking;
        setIsTracking(newStatus);
        await invoke("set_tracking_status", {isTracking: newStatus});
        await invoke("refresh_tray_menu");
    };

    const checkForUpdates = async () => {
        if (updateStatus === "checking" || updateStatus === "applying") return;
        setUpdateStatus("checking");
        try {
            const hasUpdate = await invoke<boolean>("check_update_cmd");
            if (hasUpdate) {
                setUpdateStatus("available");
            } else {
                setUpdateStatus("upToDate");
                window.setTimeout(() => setUpdateStatus("idle"), 1200);
            }
        } catch {
            setUpdateStatus("error");
            window.setTimeout(() => setUpdateStatus("idle"), 1500);
        }
    };

    const applyUpdate = async () => {
        if (updateStatus === "checking" || updateStatus === "applying") return;
        setUpdateStatus("applying");
        try {
            await invoke("apply_update_cmd");
        } catch {
            setUpdateStatus("error");
            window.setTimeout(() => setUpdateStatus("idle"), 1500);
            return;
        }
        setUpdateStatus("idle");
    };
    return (
        <div className="flex min-w-0 shrink-0 flex-col border-b border-gray-700">
          <div className="flex min-w-0 items-center 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-1 justify-start overflow-x-auto p-2.5 nice-scrollbar sm:justify-center 2xl:col-start-2 2xl:flex-none">
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <button
                    onClick={() => setCurrentView("calendar")}
                    className={`shrink-0 rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${currentView === "calendar"
                        ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-inset ring-blue-300/25"
                        : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
                    }`}
                >
                    Calendar
                </button>
                <button
                    onClick={() => setCurrentView("detailed")}
                    className={`shrink-0 rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${currentView === "detailed"
                        ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-inset ring-blue-300/25"
                        : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
                    }`}
                >
                    Detailed
                </button>
                <button
                    onClick={() => setCurrentView("categories")}
                    aria-current={isAppRulesView ? "page" : undefined}
                    className={`shrink-0 rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${isAppRulesView
                        ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-inset ring-blue-300/25"
                        : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
                    }`}
                >
                    App Rules
                </button>
                <button
                    onClick={() => setCurrentView("settings")}
                    className={`shrink-0 rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${currentView === "settings"
                        ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-inset ring-blue-300/25"
                        : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
                    }`}
                >
                    Settings
                </button>
                <button
                    onClick={() => setCurrentView("googleCalendars")}
                    className={`shrink-0 rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${currentView === "googleCalendars"
                        ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-inset ring-blue-300/25"
                        : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
                    }`}
                >
                    Google Calendars
                </button>
                <button
                    onClick={() => setCurrentView("sync")}
                    className={`shrink-0 rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${currentView === "sync"
                        ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-inset ring-blue-300/25"
                        : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
                    }`}
                >
                    Sync
                </button>
                {notesEnabled && (
                    <button
                        onClick={() => setCurrentView("notes")}
                        className={`shrink-0 rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${currentView === "notes"
                            ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-inset ring-blue-300/25"
                            : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
                        }`}
                    >
                        Notes
                    </button>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 px-4 2xl:col-start-3 2xl:justify-self-end">
                {appVersion && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">v{appVersion}</span>
                        <button
                            onClick={updateStatus === "available" ? applyUpdate : checkForUpdates}
                            disabled={updateStatus === "checking" || updateStatus === "applying"}
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/50 disabled:opacity-60 ${updateStatus === "available"
                                ? "text-blue-300 hover:text-white hover:bg-blue-500/10"
                                : "text-gray-400 hover:text-white hover:bg-gray-900"
                            }`}
                            title={updateStatus === "available" ? "Update now" : "Check for updates"}
                        >
                            {updateStatus === "checking" || updateStatus === "applying" ? (
                                <span
                                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-gray-200"/>
                            ) : updateStatus === "upToDate" ? (
                                <span className="text-sm leading-none">✓</span>
                            ) : updateStatus === "available" ? (
                                <span className="text-sm leading-none">⬆</span>
                            ) : updateStatus === "error" ? (
                                <span className="text-sm leading-none">!</span>
                            ) : (
                                <span className="text-sm leading-none">⟳</span>
                            )}
                        </button>
                    </div>
                )}
                <span className={`text-sm ${isTracking ? 'text-green-400' : 'text-gray-500'}`}>
                    {isDev ? 'Tracking disabled (dev)' : isTracking ? 'Tracking' : 'Paused'}
                </span>
                <button
                    onClick={toggleTracking}
                    disabled={isDev}
                    title={isDev ? 'Activity tracking is disabled in dev mode' : undefined}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTracking ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                    aria-label={isTracking ? 'Pause tracking' : 'Resume tracking'}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTracking ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>
          </div>
          {isAppRulesView && (
              <nav className="flex min-w-0 items-center justify-start overflow-x-auto border-t border-gray-800/70 bg-gray-950/60 px-5 py-2 nice-scrollbar sm:justify-center" aria-label="App rules sections">
                  <div className="grid w-full min-w-[420px] max-w-[620px] shrink-0 grid-cols-4">
                      {appRuleViews.map(({view, label}) => (
                          <button
                              key={view}
                              onClick={() => setCurrentView(view)}
                              aria-current={currentView === view ? "page" : undefined}
                              className={`w-full border-b-2 px-4 py-3 text-center text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${currentView === view
                                  ? "border-blue-400 text-blue-200"
                                  : "border-transparent text-gray-500 hover:text-gray-300"
                              }`}
                          >
                              {label}
                          </button>
                      ))}
                  </div>
              </nav>
          )}
        </div>
    );
}
