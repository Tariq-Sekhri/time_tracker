import { invokeOrThrow } from "../utils.ts";

const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const DEFAULT_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || "";

export type GoogleOAuthAppCredentials = {
    client_id: string;
    client_secret: string;
};

let credsCache: { clientId: string; clientSecret: string } | null = null;

function applyCache(raw: GoogleOAuthAppCredentials) {
    credsCache = {
        clientId: raw.client_id,
        clientSecret: raw.client_secret,
    };
}

export async function hydrateGoogleOAuthCredentials(): Promise<void> {
    const fromDb = await invokeOrThrow<GoogleOAuthAppCredentials>(
        "get_google_oauth_app_credentials"
    );
    let clientId = fromDb.client_id || "";
    let clientSecret = fromDb.client_secret || "";

    try {
        const legacyId = localStorage.getItem("google_oauth_client_id");
        const legacySecret = localStorage.getItem("google_oauth_client_secret");
        if (legacyId && legacySecret) {
            clientId = legacyId;
            clientSecret = legacySecret;
            await invokeOrThrow("set_google_oauth_app_credentials", {
                clientId,
                clientSecret,
            });
            localStorage.removeItem("google_oauth_client_id");
            localStorage.removeItem("google_oauth_client_secret");
            applyCache({ client_id: clientId, client_secret: clientSecret });
            return;
        }
    } catch (e) {
        console.error("[Google OAuth] Failed to migrate credentials from localStorage:", e);
    }

    if (!clientId && !clientSecret && DEFAULT_CLIENT_ID && DEFAULT_CLIENT_SECRET) {
        clientId = DEFAULT_CLIENT_ID;
        clientSecret = DEFAULT_CLIENT_SECRET;
        await invokeOrThrow("set_google_oauth_app_credentials", {
            clientId,
            clientSecret,
        });
    }

    applyCache({ client_id: clientId, client_secret: clientSecret });
}

export async function setGoogleOAuthCredentials(clientId: string, clientSecret: string): Promise<void> {
    await invokeOrThrow("set_google_oauth_app_credentials", {
        clientId,
        clientSecret,
    });
    applyCache({ client_id: clientId, client_secret: clientSecret });
}

export function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
    return credsCache ?? {
        clientId: DEFAULT_CLIENT_ID,
        clientSecret: DEFAULT_CLIENT_SECRET,
    };
}

export function hasGoogleOAuthCredentials(): boolean {
    const CLIENT_ID = credsCache?.clientId ?? DEFAULT_CLIENT_ID;
    const CLIENT_SECRET = credsCache?.clientSecret ?? DEFAULT_CLIENT_SECRET;
    return (
        CLIENT_ID !== "" &&
        CLIENT_SECRET !== "" &&
        CLIENT_ID.includes(".apps.googleusercontent.com") &&
        CLIENT_SECRET.startsWith("GOCSPX-") &&
        !CLIENT_ID.includes("YOUR_DEFAULT") &&
        !CLIENT_SECRET.includes("YOUR_DEFAULT")
    );
}

export function isUsingDefaultCredentials(): boolean {
    const { clientId, clientSecret } = getGoogleOAuthCredentials();
    return clientId === DEFAULT_CLIENT_ID || clientSecret === DEFAULT_CLIENT_SECRET;
}

export type AuthStatus = {
    logged_in: boolean;
    email?: string;
};

export type GoogleCalendar = {
    id: number;
    google_calendar_id: string;
    name: string;
    color: string;
    account_email: string;
};

export type NewGoogleCalendar = {
    google_calendar_id: string;
    name: string;
    color: string;
    account_email: string;
};

export type UpdateGoogleCalendar = {
    id: number;
    name?: string;
    color?: string;
};

export type GoogleCalendarInfo = {
    google_calendar_id: string;
    name: string;
    color: string;
    access_role: string;
    selected: boolean;
};

export type GoogleCalendarEvent = {
    calendar_id: number;
    event_id: string;
    title: string;
    start: number;
    end: number;
    description?: string;
    location?: string;
};

export function googleEventDurationInRange(
    e: GoogleCalendarEvent,
    rangeStart: number,
    rangeEnd: number,
    progressEnd: number
): number {
    const cap = Math.min(rangeEnd, progressEnd);
    const segStart = Math.max(e.start, rangeStart);
    const segEnd = Math.min(e.end, cap);
    if (segEnd <= segStart) return 0;
    return segEnd - segStart;
}

export function googleEventPastDurationSeconds(e: GoogleCalendarEvent, nowUnixSec: number): number {
    return googleEventDurationInRange(e, e.start, e.end, nowUnixSec);
}

export type CreateGoogleCalendarEvent = {
    calendar_id: number;
    title: string;
    start: number;
    end: number;
    description?: string;
};

export type UpdateGoogleCalendarEvent = {
    calendar_id: number;
    event_id: string;
    title: string;
    start: number;
    end: number;
    description?: string;
};

export type DeleteGoogleCalendarEvent = {
    calendar_id: number;
    event_id: string;
};

export async function google_oauth_login(): Promise<AuthStatus> {
    if (!hasGoogleOAuthCredentials()) {
        throw new Error("OAuth credentials not configured. Please contact the app developer.");
    }
    return invokeOrThrow<AuthStatus>("google_oauth_login");
}

export async function google_oauth_logout(): Promise<null> {
    return invokeOrThrow<null>("google_oauth_logout");
}

export async function get_google_auth_status(): Promise<AuthStatus> {
    return invokeOrThrow<AuthStatus>("get_google_auth_status");
}

export async function list_available_google_calendars(): Promise<GoogleCalendarInfo[]> {
    if (!hasGoogleOAuthCredentials()) {
        throw new Error("Google OAuth credentials not set");
    }
    return invokeOrThrow<GoogleCalendarInfo[]>("list_available_google_calendars");
}

export async function get_google_calendars(): Promise<GoogleCalendar[]> {
    return invokeOrThrow<GoogleCalendar[]>("get_google_calendars");
}

export async function get_google_calendar_by_id(id: number): Promise<GoogleCalendar> {
    return invokeOrThrow<GoogleCalendar>("get_google_calendar_by_id", { id });
}

export async function insert_google_calendar(calendar: NewGoogleCalendar): Promise<number> {
    return invokeOrThrow<number>("insert_google_calendar", { newCalendar: calendar });
}

export async function update_google_calendar(update: UpdateGoogleCalendar): Promise<null> {
    return invokeOrThrow<null>("update_google_calendar", { update });
}

export async function delete_google_calendar(id: number): Promise<null> {
    return invokeOrThrow<null>("delete_google_calendar", { id });
}

export async function get_google_calendar_events(
    calendar_id: number,
    start_time: number,
    end_time: number
): Promise<GoogleCalendarEvent[]> {
    if (!hasGoogleOAuthCredentials()) {
        return [];
    }
    return invokeOrThrow<GoogleCalendarEvent[]>("get_google_calendar_events", {
        params: {
            calendarId: calendar_id,
            startTime: start_time,
            endTime: end_time,
        },
    });
}

export async function get_all_google_calendar_events(
    start_time: number,
    end_time: number
): Promise<GoogleCalendarEvent[]> {
    if (!hasGoogleOAuthCredentials()) {
        return [];
    }
    return invokeOrThrow<GoogleCalendarEvent[]>("get_all_google_calendar_events", {
        params: {
            startTime: start_time,
            endTime: end_time,
        },
    });
}

export async function create_google_calendar_event(
    event: CreateGoogleCalendarEvent
): Promise<string> {
    if (!hasGoogleOAuthCredentials()) {
        throw new Error("Google OAuth credentials not set");
    }
    return invokeOrThrow<string>("create_google_calendar_event", {
        params: event,
    });
}

export async function update_google_calendar_event(
    update: UpdateGoogleCalendarEvent
): Promise<null> {
    if (!hasGoogleOAuthCredentials()) {
        throw new Error("Google OAuth credentials not set");
    }
    return invokeOrThrow<null>("update_google_calendar_event", {
        update,
    });
}

export async function delete_google_calendar_event(
    params: DeleteGoogleCalendarEvent
): Promise<null> {
    if (!hasGoogleOAuthCredentials()) {
        throw new Error("Google OAuth credentials not set");
    }
    return invokeOrThrow<null>("delete_google_calendar_event", {
        params,
    });
}
