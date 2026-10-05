// Runs before the app and Vite client. The demo may load its own assets only.
(() => {
    const isLocalUrl = (input) => {
        const value = input instanceof Request ? input.url : String(input);
        const url = new URL(value, location.href);
        return url.origin === location.origin;
    };
    const blocked = () => new Error("External requests are disabled in the Time Tracker demo");
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
        if (!isLocalUrl(input)) return Promise.reject(blocked());
        return originalFetch(input, options);
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (!isLocalUrl(url)) throw blocked();
        return originalOpen.call(this, method, url, ...args);
    };
    if (navigator.sendBeacon) {
        const originalBeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = (url, data) => isLocalUrl(url) ? originalBeacon(url, data) : false;
    }
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = class extends OriginalWebSocket {
        constructor(url, protocols) {
            const target = new URL(String(url), location.href);
            if (target.host !== location.host || !["ws:", "wss:"].includes(target.protocol)) throw blocked();
            super(url, protocols);
        }
    };
    const OriginalEventSource = window.EventSource;
    if (OriginalEventSource) window.EventSource = class extends OriginalEventSource {
        constructor(url, options) {
            if (!isLocalUrl(url)) throw blocked();
            super(url, options);
        }
    };
})();
