import React from "react";
import ReactDOM from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {ToastProvider} from "../Componants/Toast";
import ErrorBoundary from "../Componants/ErrorBoundary";
import {installDiagnostics} from "../diagnostics";
import MobileApp from "./MobileApp";
import "./mobile.css";

installDiagnostics();
const client = new QueryClient({defaultOptions: {queries: {retry: 1, refetchOnWindowFocus: true}}});
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode><QueryClientProvider client={client}><ToastProvider><ErrorBoundary showLogFolder={false}><MobileApp /></ErrorBoundary></ToastProvider></QueryClientProvider></React.StrictMode>,
);
