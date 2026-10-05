const listeners = new Map<string, Set<(event: {payload: unknown}) => void>>();

export async function listen<T>(event: string, handler: (event: {payload: T}) => void): Promise<() => void> {
    const handlers = listeners.get(event) ?? new Set();
    listeners.set(event, handlers);
    const wrapped = handler as (event: {payload: unknown}) => void;
    handlers.add(wrapped);
    return () => { handlers.delete(wrapped); };
}

export async function emit(event: string, payload?: unknown): Promise<void> {
    for (const handler of listeners.get(event) ?? []) handler({payload});
}
