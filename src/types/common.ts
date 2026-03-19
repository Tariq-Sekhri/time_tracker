export function toErrorString(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error, null, 2);
    } catch {
        return String(error);
    }
}
