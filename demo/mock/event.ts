export function listen<T>(
    _event: string,
    _handler: (event: { payload: T }) => void
): Promise<() => void> {
    return Promise.resolve(() => {});
}

export function emit(_event: string, _payload?: unknown): Promise<void> {
    return Promise.resolve();
}
