/* @vitest-environment jsdom */
import {cleanup, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import type {MobileDevice, MobileLog, MobileState} from "./api";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
    invoke: (...args: unknown[]) => invokeMock(...args),
}));

import MobileApp from "./MobileApp";
import {ToastProvider} from "../Componants/Toast";

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
    };
    if (!window.matchMedia) {
        window.matchMedia = (() => ({
            matches: true,
            media: "",
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
        })) as unknown as typeof window.matchMedia;
    }
    if (!globalThis.ResizeObserver) {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    localStorage.removeItem("time-tracker.mobile.calendar-position");
    window.history.replaceState(null, "", "#usage");
});

function createHarness(googleCalendar?: NonNullable<MobileState["googleCalendar"]>) {
    const now = Date.now();
    const devices: MobileDevice[] = [
        {
            uuid: "phone-1",
            name: "Pixel",
            is_local: true,
            is_tracking: false,
            last_sync_id: 5,
            in_cal: true,
            in_stats: true,
            available_on_server: true,
            has_local_logs: true,
        },
        {
            uuid: "desktop-1",
            name: "Studio PC",
            is_local: false,
            is_tracking: false,
            last_sync_id: 0,
            in_cal: true,
            in_stats: true,
            available_on_server: true,
            has_local_logs: false,
        },
        {
            uuid: "old-laptop",
            name: "Old Laptop",
            is_local: false,
            is_tracking: false,
            last_sync_id: 3,
            in_cal: true,
            in_stats: false,
            available_on_server: false,
            has_local_logs: true,
        },
    ];
    let localLogs: MobileLog[] = [
        {
            id: 1,
            package_name: "com.example.phone",
            app_label: "Notes App",
            app_name: "Notes App",
            start_timestamp: now - 360_000,
            end_timestamp: now - 60_000,
            duration: 300,
            category: null,
            device_uuid: "phone-1",
            device_name: "Pixel",
            is_remote: false,
        },
    ];
    let remoteLogs: MobileLog[] = [
        {
            id: 1,
            package_name: "Visual Studio Code",
            app_label: "Visual Studio Code",
            app_name: "Visual Studio Code",
            start_timestamp: now - 420_000,
            end_timestamp: now - 60_000,
            duration: 360,
            category: null,
            device_uuid: "desktop-1",
            device_name: "Studio PC",
            is_remote: true,
        },
    ];
    let timer: MobileState["timer"] = null;
    const calls: Array<{operation: string; payload: Record<string, unknown>}> = [];

    const currentState = (): MobileState => ({
        permissions: {usage: true, browser: true, media: true},
        googleCalendar: googleCalendar && {...googleCalendar},
        settings: {
            day_start_hour: 0,
            min_app_duration: 0,
            min_log_duration: 1,
            max_attach_distance: 30,
            lookahead_window: 60,
            min_timeblock_duration: 60,
            notes_enabled: false,
            use_bar_usage_chart: false,
        },
        sync: {
            server: "sync.example.test",
            registered: true,
            active: true,
            uuid: "phone-1",
            name: "Pixel",
            nextSyncSeconds: 45,
        },
        devices: devices.map(device => ({...device})),
        manualEntries: [],
        timer,
        timerStatus: "CONNECTED",
        projects: [],
        version: "0.5.4",
        firstLogMs: now - 420_000,
    });

    invokeMock.mockImplementation(async (_command: string, rawArgs: {operation: string; payload?: Record<string, unknown>}) => {
        const operation = rawArgs.operation;
        const payload = rawArgs.payload ?? {};
        calls.push({operation, payload});
        switch (operation) {
            case "state":
                return currentState();
            case "import":
                return null;
            case "calendar.permission":
                googleCalendar!.allowed = true;
                return null;
            case "calendar.sources":
                return [{key: "personal", name: "Personal", account: "calendar@example.test"}];
            case "calendar.select":
                googleCalendar!.selected = payload.selected ? [String(payload.key)] : [];
                return null;
            case "calendar.events": {
                const start = String(payload.firstDay);
                const end = new Date(`${start}T00:00:00Z`);
                end.setUTCDate(end.getUTCDate() + 1);
                return [{id: "event", title: "Team planning", start, end: end.toISOString().slice(0, 10), allDay: true, calendar: "Personal"}];
            }
            case "timer.save":
                timer = {
                    session_id: timer?.session_id ?? "session-1",
                    title: String(payload.title ?? ""),
                    project_name: (payload.project as string | null | undefined) ?? null,
                    start_time: timer?.start_time ?? Math.floor(Date.now() / 1000) - 90,
                };
                return null;
            case "timer.stop":
                timer = null;
                return null;
            case "sync.devices":
                return devices.map(device => ({...device}));
            case "sync.subscribe": {
                const target = devices.find(device => device.uuid === payload.uuid)!;
                target.is_tracking = true;
                target.in_cal = true;
                target.in_stats = true;
                target.has_local_logs = true;
                return {downloaded: 2};
            }
            case "sync.unsubscribe": {
                const target = devices.find(device => device.uuid === payload.uuid)!;
                target.is_tracking = false;
                target.in_cal = false;
                target.in_stats = false;
                target.has_local_logs = false;
                remoteLogs = remoteLogs.filter(log => log.device_uuid !== payload.uuid);
                return null;
            }
            case "device.update": {
                const target = devices.find(device => device.uuid === payload.uuid)!;
                if (typeof payload.in_cal === "boolean") target.in_cal = payload.in_cal;
                if (typeof payload.in_stats === "boolean") target.in_stats = payload.in_stats;
                return null;
            }
            case "sync.now":
                return "Downloaded 1 log, notes synced";
            case "usage": {
                const selected = payload.deviceUuid as string | undefined;
                const includeLocal = selected ? selected === "phone-1" : devices[0].in_stats;
                const includeDesktop = selected ? selected === "desktop-1" : (devices[1].is_tracking || devices[1].has_local_logs) && devices[1].in_stats;
                const apps = [
                    ...(includeLocal ? [{packageName: "com.example.phone", label: "Notes App", seconds: 300}] : []),
                    ...(includeDesktop ? [{packageName: "Visual Studio Code", label: "Visual Studio Code", seconds: 360}] : []),
                ];
                return {
                    total: apps.reduce((sum, app) => sum + app.seconds, 0),
                    apps,
                    days: [{date: "2026-11-21", seconds: apps.reduce((sum, app) => sum + app.seconds, 0)}],
                };
            }
            case "logs": {
                const selected = payload.deviceUuid as string | undefined;
                const scope = (payload.scope as string | undefined) ?? "logs";
                const rows: MobileLog[] = [];
                const allowLocal = selected ? selected === "phone-1" : scope !== "calendar" || devices[0].in_cal;
                const allowDesktop = selected
                    ? selected === "desktop-1"
                    : (devices[1].is_tracking || devices[1].has_local_logs) && (scope !== "calendar" || devices[1].in_cal);
                if (allowLocal) rows.push(...localLogs);
                if (allowDesktop) rows.push(...remoteLogs);
                return payload.offset ? [] : rows;
            }
            case "log.delete": {
                if (payload.is_remote) {
                    remoteLogs = remoteLogs.filter(log => !(log.id === payload.id && log.device_uuid === payload.device_uuid));
                } else {
                    localLogs = localLogs.filter(log => log.id !== payload.id);
                }
                return null;
            }
            default:
                return null;
        }
    });

    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
    return {devices, calls, queryClient};
}

it("shows imported events in a Monday-start week and restores the view after visiting Settings", async () => {
    const user = userEvent.setup();
    const {calls, queryClient} = createHarness({allowed: false, selected: []});
    render(<QueryClientProvider client={queryClient}><ToastProvider><MobileApp /></ToastProvider></QueryClientProvider>);
    const nav = await screen.findByRole("navigation", {name: "Main navigation"});
    await user.click(within(nav).getByRole("button", {name: "Settings"}));
    await user.click(screen.getByRole("button", {name: "Allow calendar access"}));
    const source = (await screen.findByRole("checkbox", {name: /Personal/})) as HTMLInputElement;
    await user.click(source);
    await waitFor(() => expect(source.checked).toBe(true));

    const openCalendar = () => user.click(within(nav).getByRole("button", {name: "Calendar"}));
    await openCalendar();
    await user.click(screen.getByRole("button", {name: "Week"}));
    const previousWeek = screen.getByRole("button", {name: "Previous week"});
    await user.click(previousWeek);
    await waitFor(() => {
        const weekRequest = [...calls].reverse().find(call => call.operation === "calendar.events")!;
        const start = new Date(`${weekRequest.payload.firstDay}T00:00:00Z`);
        const end = new Date(`${weekRequest.payload.endDay}T00:00:00Z`);
        expect(start.getUTCDay()).toBe(1);
        expect(+end - +start).toBe(7 * 86_400_000);
    });
    const selectedDate = (screen.getByLabelText("Selected day") as HTMLInputElement).value;
    await user.click(await screen.findByText("Team planning"));
    const event = screen.getByRole("dialog", {name: "Team planning"});
    expect(within(event).getByText("All day")).toBeTruthy();
    await user.click(within(event).getByRole("button", {name: "Close dialog"}));

    await user.click(within(nav).getByRole("button", {name: "Settings"}));
    const selectedSource = (await screen.findByRole("checkbox", {name: /Personal/})) as HTMLInputElement;
    await user.click(selectedSource);
    await waitFor(() => expect(selectedSource.checked).toBe(false));
    await openCalendar();
    expect(screen.getByRole("button", {name: "Week"}).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Selected day") as HTMLInputElement).value).toBe(selectedDate);
    expect(screen.queryByText("Team planning")).toBeNull();
    queryClient.clear();
});

describe("MobileApp remote device log sync", () => {
    it("supports subscribing, toggling visibility, removing old device logs, and filtering usage/logs/calendar", async () => {
        const user = userEvent.setup();
        const {calls, queryClient} = createHarness();

        render(
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <MobileApp />
                </ToastProvider>
            </QueryClientProvider>,
        );

        await screen.findByText("Notes App");
        const nav = screen.getByRole("navigation", {name: "Main navigation"});

        // Navigate to Settings -> Sync and subscribe to Studio PC
        await user.click(within(nav).getByRole("button", {name: "Settings"}));
        await user.click(await screen.findByRole("button", {name: "Sync"}));
        await screen.findByText("Studio PC");
        const studioCard = screen.getByText("Studio PC").closest(".device")! as HTMLElement;
        await user.click(within(studioCard).getByRole("button", {name: "Subscribe"}));
        await screen.findByText("Added 2 logs from Studio PC");
        await waitFor(() => expect(within(studioCard).getByRole("button", {name: "Subscribed"})).toBeTruthy());

        // Toggle Studio PC stats visibility off, then back on
        const studioStats = within(studioCard).getByLabelText("Stats") as HTMLInputElement;
        expect(studioStats.checked).toBe(true);
        await user.click(studioStats);
        await waitFor(() => expect(calls.some(c => c.operation === "device.update" && c.payload.uuid === "desktop-1" && c.payload.in_stats === false)).toBe(true));
        await user.click(within(studioCard).getByLabelText("Stats"));

        // Verify offline device with downloaded logs shows warning and Remove logs confirmation
        const oldCard = screen.getByText("Old Laptop").closest(".device")! as HTMLElement;
        expect(within(oldCard).getByText("No longer on server — downloaded logs kept locally")).toBeTruthy();
        await user.click(within(oldCard).getByRole("button", {name: "Remove logs"}));
        const removeDialog = await screen.findByRole("dialog", {name: "Remove downloaded logs?"});
        await user.click(within(removeDialog).getByRole("button", {name: "Remove logs"}));
        await waitFor(() => expect(calls.some(c => c.operation === "sync.unsubscribe" && c.payload.uuid === "old-laptop")).toBe(true));

        // Check Home device filter chips
        await user.click(within(nav).getByRole("button", {name: "Home"}));
        const homeFilter = await screen.findByRole("group", {name: "Filter by device"});
        await user.click(within(homeFilter).getByRole("button", {name: "Studio PC"}));
        await waitFor(() => {
            expect(calls.some(c => c.operation === "usage" && c.payload.scope === "stats" && c.payload.deviceUuid === "desktop-1")).toBe(true);
        });
        await screen.findByText("Visual Studio Code");

        // Navigate to Calendar -> View logs; verify both id=1 local & remote rows and delete payloads
        await user.click(within(nav).getByRole("button", {name: "Calendar"}));
        await user.click(await screen.findByRole("button", {name: "View logs"}));
        await screen.findByText("Notes App");
        await screen.findByText("Visual Studio Code");

        await user.click(screen.getByText("Visual Studio Code").closest("button")!);
        const remoteModal = await screen.findByRole("dialog", {name: "Visual Studio Code"});
        await user.click(within(remoteModal).getByRole("button", {name: "Remove log…"}));
        await screen.findByText(/It stays on its source device and the sync server/);
        await user.click(within(remoteModal).getByRole("button", {name: "Remove log"}));
        await waitFor(() => {
            expect(calls.some(c => c.operation === "log.delete" && c.payload.id === 1 && c.payload.device_uuid === "desktop-1" && c.payload.is_remote === true)).toBe(true);
        });

        await user.click(screen.getByText("Notes App").closest("button")!);
        const localModal = await screen.findByRole("dialog", {name: "Notes App"});
        await user.click(within(localModal).getByRole("button", {name: "Delete log…"}));
        await screen.findByText(/Its deletion will also be uploaded on the next sync/);
        await user.click(within(localModal).getByRole("button", {name: "Delete log"}));
        await waitFor(() => {
            expect(calls.some(c => c.operation === "log.delete" && c.payload.id === 1 && c.payload.is_remote === undefined)).toBe(true);
        });

        // Check Calendar device filter queries with scope="calendar" and selected device
        await user.click(within(nav).getByRole("button", {name: "Calendar"}));
        const calFilter = await screen.findByRole("group", {name: "Filter by device"});
        await user.click(within(calFilter).getByRole("button", {name: "Pixel (this phone)"}));
        await waitFor(() => {
            expect(calls.some(c => c.operation === "logs" && c.payload.scope === "calendar" && c.payload.deviceUuid === "phone-1")).toBe(true);
        });

        queryClient.clear();
    });

    it("updates calendar zoom steps cleanly between 50% and 300% and resets to 100%", async () => {
        const user = userEvent.setup();
        const {queryClient} = createHarness();

        const {container} = render(
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <MobileApp />
                </ToastProvider>
            </QueryClientProvider>,
        );

        await screen.findByText("Notes App");
        const nav = screen.getByRole("navigation", {name: "Main navigation"});
        await user.click(within(nav).getByRole("button", {name: "Calendar"}));

        await waitFor(() => expect(container.querySelector(".mobile-calendar")).toBeTruthy());
        const getCalendarWrap = () => container.querySelector(".mobile-calendar") as HTMLElement;
        const zoomGroup = screen.getByRole("group", {name: "Calendar zoom"});
        const zoomOut = within(zoomGroup).getByRole("button", {name: "Zoom out"}) as HTMLButtonElement;
        const resetZoom = within(zoomGroup).getByRole("button", {name: "Reset zoom"}) as HTMLButtonElement;
        const zoomIn = within(zoomGroup).getByRole("button", {name: "Zoom in"}) as HTMLButtonElement;

        expect(resetZoom.textContent).toBe("100%");
        expect(resetZoom.disabled).toBe(true);
        expect(getCalendarWrap().style.getPropertyValue("--slot-height")).toBe("28px");

        await user.click(zoomIn);
        expect(resetZoom.textContent).toBe("150%");
        expect(resetZoom.disabled).toBe(false);
        expect(getCalendarWrap().style.getPropertyValue("--slot-height")).toBe("42px");

        await user.click(zoomOut);
        await user.click(zoomOut);
        expect(resetZoom.textContent).toBe("75%");
        expect(getCalendarWrap().style.getPropertyValue("--slot-height")).toBe("21px");
        expect(zoomOut.disabled).toBe(false);

        await user.click(zoomOut);
        expect(resetZoom.textContent).toBe("50%");
        expect(getCalendarWrap().style.getPropertyValue("--slot-height")).toBe("14px");
        expect(zoomOut.disabled).toBe(true);

        await user.click(resetZoom);
        expect(resetZoom.textContent).toBe("100%");
        expect(resetZoom.disabled).toBe(true);
        expect(getCalendarWrap().style.getPropertyValue("--slot-height")).toBe("28px");

        queryClient.clear();
    });

    it("renders compact manual timer and supports Start, Save, and Stop", async () => {
        const user = userEvent.setup();
        const {calls, queryClient} = createHarness();

        render(
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <MobileApp />
                </ToastProvider>
            </QueryClientProvider>,
        );

        const input = await screen.findByLabelText("What are you working on?") as HTMLInputElement;
        const startButton = screen.getByRole("button", {name: "Start"});
        expect(screen.queryByRole("button", {name: "Save"})).toBeNull();
        expect(screen.queryByRole("button", {name: "Stop"})).toBeNull();

        await user.type(input, "Deep work");
        await user.click(startButton);

        await waitFor(() => {
            expect(calls.some(c => c.operation === "timer.save" && c.payload.title === "Deep work" && c.payload.project === null)).toBe(true);
        });
        await screen.findByRole("button", {name: "Save"});
        const stopButton = screen.getByRole("button", {name: "Stop"});
        expect(screen.getByLabelText("Elapsed time")).toBeTruthy();

        await user.click(stopButton);
        await waitFor(() => {
            expect(calls.some(c => c.operation === "timer.stop")).toBe(true);
        });

        queryClient.clear();
    });
});
