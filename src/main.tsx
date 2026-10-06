import "./suppress-react-devtools-banner";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import App from "./App";
import { hydrateGoogleOAuthCredentials } from "./api/GoogleCalendar.ts";
import { migrateLocalStorageToDb } from "./migrateLocalStorageToDb.ts";
import {installDiagnostics, logMessage, reportError} from "./diagnostics.ts";
import ErrorBoundary from "./Componants/ErrorBoundary.tsx";
import {installLongTaskObserver} from "./perf.ts";

installDiagnostics();
installLongTaskObserver();
const queryClient = new QueryClient({
    queryCache: new QueryCache({onError: (error, query) => {
        void reportError(`Query failed: ${String(query.queryKey[0])}`, error);
    }}),
    mutationCache: new MutationCache({onError: (error) => {
        void reportError("Mutation failed", error);
    }}),
});

async function bootstrap() {
    await hydrateGoogleOAuthCredentials();
    await migrateLocalStorageToDb();
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                <ErrorBoundary><App /></ErrorBoundary>
            </QueryClientProvider>
        </React.StrictMode>
    );
    void logMessage("info", "Frontend mounted");
}

void bootstrap().catch(async (error) => {
    await reportError("Frontend bootstrap failed", error);
    const root = document.getElementById("root");
    if (root) {
        root.textContent = "Time Tracker could not start. Please send the most recent file from your Time Tracker logs folder to support.";
    }
});
