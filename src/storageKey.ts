export function storageKey(name: string): string {
    return import.meta.env.DEV ? `dev:${name}` : name;
}
