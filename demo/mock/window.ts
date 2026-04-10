export function getCurrentWindow() {
    return {
        listen: async (_event: string, _handler: () => void): Promise<() => void> => {
            return () => {};
        },
    };
}
