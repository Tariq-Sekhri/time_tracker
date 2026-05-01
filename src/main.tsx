import "./suppress-react-devtools-banner";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { hydrateGoogleOAuthCredentials } from "./api/GoogleCalendar.ts";
import { migrateLocalStorageToDb } from "./migrateLocalStorageToDb.ts";
import { hydrateSettingsStore } from "./stores/settingsStore.ts";

const queryClient = new QueryClient();

async function bootstrap() {
    await hydrateGoogleOAuthCredentials();
    await migrateLocalStorageToDb();
    await hydrateSettingsStore();
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </React.StrictMode>
    );
}

bootstrap();
