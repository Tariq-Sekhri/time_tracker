export function exactAppRegexPattern(appName: string): string {
    const escaped = appName.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    return `^${escaped}$`;
}
