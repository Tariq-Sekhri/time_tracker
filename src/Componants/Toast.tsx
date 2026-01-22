import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "loading";

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    errorDetails?: string; // Full error details that can be copied
}

interface ToastContainerProps {
    toasts: Toast[];
    onRemove: (id: string) => void;
    onUpdate?: (id: string, message: string, type: ToastType) => void;
}

export function ToastContainer({ toasts, onRemove, onUpdate }: ToastContainerProps) {
    return (
        <div className="fixed top-4 right-4 z-50 space-y-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`min-w-[300px] max-w-md px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right ${toast.type === "success"
                        ? "bg-green-600 text-white"
                        : toast.type === "error"
                            ? "bg-red-600 text-white"
                            : toast.type === "loading"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-700 text-white"
                        }`}
                >
                    {toast.type === "loading" && (
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    )}
                    {toast.type === "success" && (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                    {toast.type === "error" && (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                    <span
                        className={`flex-1 ${toast.errorDetails ? "cursor-pointer hover:underline" : ""}`}
                        onClick={toast.errorDetails && onUpdate ? async () => {
                            try {
                                await navigator.clipboard.writeText(toast.errorDetails || toast.message);
                                // Temporarily update message to show copied confirmation
                                const originalMessage = toast.message;
                                onUpdate(toast.id, "✓ Copied to clipboard! Click to copy again.", "success");
                                setTimeout(() => {
                                    onUpdate(toast.id, originalMessage, toast.type);
                                }, 2000);
                            } catch (e) {
                                console.error("Failed to copy to clipboard:", e);
                                if (onUpdate) {
                                    onUpdate(toast.id, "Failed to copy to clipboard", "error");
                                }
                            }
                        } : undefined}
                        title={toast.errorDetails ? "Click to copy error details to clipboard" : undefined}
                    >
                        {toast.message}
                    </span>
                    <button
                        onClick={() => onRemove(toast.id)}
                        className="text-white/80 hover:text-white"
                        title="Close"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = (message: string, type: ToastType = "info", duration: number = 3000, errorDetails?: string) => {
        // For error toasts, default duration is longer
        if (type === "error" && duration === 3000) {
            duration = 5000;
        }
        const id = Math.random().toString(36).substring(7);
        const toast: Toast = { id, message, type, errorDetails };

        setToasts((prev) => {
            const updated = [...prev, toast];
            if (updated.length > 4) {
                updated.shift();
            }
            return updated;
        });

        if (type !== "loading" && duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }

        return id;
    };

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const updateToast = (id: string, message: string, type: ToastType, errorDetails?: string) => {
        setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, message, type, errorDetails: errorDetails ?? t.errorDetails } : t))
        );
    };

    return { toasts, showToast, removeToast, updateToast };
}