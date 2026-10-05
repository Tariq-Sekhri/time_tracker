import {Component, type ErrorInfo, type ReactNode} from "react";
import {openSupportLogFolder, reportError} from "../diagnostics.ts";

export default class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
    state = {failed: false};
    static getDerivedStateFromError() { return {failed: true}; }
    componentDidCatch(error: Error, info: ErrorInfo) {
        void reportError(`React render failed component_stack=${info.componentStack}`, error);
    }
    render() {
        if (!this.state.failed) return this.props.children;
        return <main className="bg-black text-white h-screen p-6 space-y-4">
            <h1 className="text-xl font-semibold">Time Tracker encountered an error</h1>
            <p>Send the most recent log file to support so we can investigate.</p>
            <div className="flex gap-3">
                <button className="rounded bg-gray-800 px-3 py-2" onClick={() => {
                    void openSupportLogFolder().catch((error) => reportError("Open logs after render failure", error));
                }}>Open log folder</button>
                <button className="rounded bg-gray-800 px-3 py-2" onClick={() => window.location.reload()}>Reload</button>
            </div>
        </main>;
    }
}
