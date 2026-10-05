import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {expect, it, vi} from "vitest";

it("blocks external fetch, XHR, beacons, sockets and event streams before their network implementations run", async () => {
    const fetch = vi.fn().mockResolvedValue("local asset");
    const open = vi.fn();
    const beacon = vi.fn().mockReturnValue(true);
    const socket = vi.fn();
    const stream = vi.fn();
    class XHR {open(...args: unknown[]) {open(...args);}}
    class Socket {constructor(...args: unknown[]) {socket(...args);}}
    class Stream {constructor(...args: unknown[]) {stream(...args);}}
    const navigator = {sendBeacon: beacon};
    const window = {fetch, WebSocket: Socket, EventSource: Stream};
    runInNewContext(readFileSync(new URL("./network-guard.js", import.meta.url), "utf8"), {window, navigator, XMLHttpRequest: XHR, URL, Request, location: {href: "http://localhost:1420/", origin: "http://localhost:1420", host: "localhost:1420"}});
    for (const url of ["https://demo-sync.invalid", "http://127.0.0.1:3033/private", "//external.invalid/path"]) {
        await expect(window.fetch(url)).rejects.toThrow("External requests");
        expect(() => new XHR().open("GET", url)).toThrow("External requests");
        expect(navigator.sendBeacon(url)).toBe(false);
        expect(() => new window.EventSource(url)).toThrow("External requests");
    }
    expect(() => new window.WebSocket("wss://external.invalid")).toThrow("External requests");
    for (const spy of [fetch, open, beacon, socket, stream]) expect(spy).not.toHaveBeenCalled();
    await expect(window.fetch("/assets/app.js")).resolves.toBe("local asset");
    new XHR().open("GET", "/local");
    new window.WebSocket("ws://localhost:1420/");
    expect(fetch).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    expect(socket).toHaveBeenCalledOnce();
});
