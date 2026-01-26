import { invokeWithResult } from "../utils.ts";
import { AppError, Result } from "../types/common.ts";

// ============================================================================
// OAuth credentials are loaded from environment variables (.env file)
// Create a .env file in the project root with:
// VITE_GOOGLE_CLIENT_ID=your_client_id_here
// VITE_GOOGLE_CLIENT_SECRET=your_client_secret_here
// ============================================================================
const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const DEFAULT_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || "";

let CLIENT_ID = localStorage.getItem("google_oauth_client_id") || DEFAULT_CLIENT_ID;
let CLIENT_SECRET = localStorage.getItem("google_oauth_client_secret") || DEFAULT_CLIENT_SECRET;

export function setGoogleOAuthCredentials(clientId: string, clientSecret: string) {
    CLIENT_ID = clientId;
    CLIENT_SECRET = clientSecret;
    localStorage.setItem("google_oauth_client_id", clientId);
    localStorage.setItem("google_oauth_client_secret", clientSecret);
}

export function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
    return { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };
}

export function hasGoogleOAuthCredentials(): boolean {
    // Check if real credentials are set (not placeholders)
    // Real Google OAuth Client IDs end with .apps.googleusercontent.com
    // Real Google OAuth Client Secrets start with GOCSPX-
    return CLIENT_ID !== "" && 
           CLIENT_SECRET !== "" && 
           CLIENT_ID.includes(".apps.googleusercontent.com") &&
           CLIENT_SECRET.startsWith("GOCSPX-") &&
           !CLIENT_ID.includes("YOUR_DEFAULT") &&
           !CLIENT_SECRET.includes("YOUR_DEFAULT");
}

export function isUsingDefaultCredentials(): boolean {
    return CLIENT_ID === DEFAULT_CLIENT_ID || CLIENT_SECRET === DEFAULT_CLIENT_SECRET;
}

// OAuth types
export type AuthStatus = {
    logged_in: boolean;
    email?: string;
};

// Calendar types
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

// Event types
export type GoogleCalendarEvent = {
    calendar_id: number;
    event_id: string;
    title: string;
    start: number; // Unix timestamp
    end: number;   // Unix timestamp
    description?: string;
    location?: string;
};

export type CreateGoogleCalendarEvent = {
    calendar_id: number;
    title: string;
    start: number; // Unix timestamp
    end: number;   // Unix timestamp
    description?: string;
};

export type UpdateGoogleCalendarEvent = {
    calendar_id: number;
    event_id: string;
    title: string;
    start: number; // Unix timestamp
    end: number;   // Unix timestamp
    description?: string;
};

export type DeleteGoogleCalendarEvent = {
    calendar_id: number;
    event_id: string;
};

// ==================== OAuth Functions ====================

export async function google_oauth_login(): Promise<Result<AuthStatus, AppError>> {
    if (!hasGoogleOAuthCredentials()) {
        return {
            success: false,
            error: {
                type: "Other",
                data: "OAuth credentials not configured. Please set up your Google OAuth Client ID and Secret in the Advanced settings below."
            }
        };
    }
    return invokeWithResult<AuthStatus>("google_oauth_login", {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });
}

export async function google_oauth_logout(): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("google_oauth_logout");
}

export async function get_google_auth_status(): Promise<Result<AuthStatus, AppError>> {
    return invokeWithResult<AuthStatus>("get_google_auth_status");
}

// ==================== Calendar Functions ====================

export async function list_available_google_calendars(): Promise<Result<GoogleCalendarInfo[], AppError>> {
    if (!hasGoogleOAuthCredentials()) {
        return {
            success: false,
            error: {
                type: "Other",
                data: "Google OAuth credentials not set"
            }
        };
    }
    return invokeWithResult<GoogleCalendarInfo[]>("list_available_google_calendars", {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });
}

export async function get_google_calendars(): Promise<Result<GoogleCalendar[], AppError>> {
    return invokeWithResult<GoogleCalendar[]>("get_google_calendars");
}

export async function get_google_calendar_by_id(id: number): Promise<Result<GoogleCalendar, AppError>> {
    return invokeWithResult<GoogleCalendar>("get_google_calendar_by_id", { id });
}

export async function insert_google_calendar(calendar: NewGoogleCalendar): Promise<Result<number, AppError>> {
    return invokeWithResult<number>("insert_google_calendar", { newCalendar: calendar });
}

export async function update_google_calendar(update: UpdateGoogleCalendar): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("update_google_calendar", { update });
}

export async function delete_google_calendar(id: number): Promise<Result<null, AppError>> {
    return invokeWithResult<null>("delete_google_calendar", { id });
}

// ==================== Event Functions ====================

export async function get_google_calendar_events(
    calendar_id: number,
    start_time: number,
    end_time: number
): Promise<Result<GoogleCalendarEvent[], AppError>> {
    if (!hasGoogleOAuthCredentials()) {
        return { success: true, data: [] }; // Return empty if not configured
    }
    return invokeWithResult<GoogleCalendarEvent[]>("get_google_calendar_events", {
        calendarId: calendar_id,
        startTime: start_time,
        endTime: end_time,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });
}

export async function get_all_google_calendar_events(
    start_time: number,
    end_time: number
): Promise<Result<GoogleCalendarEvent[], AppError>> {
    if (!hasGoogleOAuthCredentials()) {
        return { success: true, data: [] }; // Return empty if not configured
    }
    return invokeWithResult<GoogleCalendarEvent[]>("get_all_google_calendar_events", {
        params: {
            startTime: start_time,
            endTime: end_time,
        },
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });
}

export async function create_google_calendar_event(
    event: CreateGoogleCalendarEvent
): Promise<Result<string, AppError>> {
    if (!hasGoogleOAuthCredentials()) {
        return {
            success: false,
            error: {
                type: "Other",
                data: "Google OAuth credentials not set"
            }
        };
    }
    return invokeWithResult<string>("create_google_calendar_event", {
        params: event,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });
}

export async function update_google_calendar_event(
    update: UpdateGoogleCalendarEvent
): Promise<Result<null, AppError>> {
    if (!hasGoogleOAuthCredentials()) {
        return {
            success: false,
            error: {
                type: "Other",
                data: "Google OAuth credentials not set"
            }
        };
    }
    return invokeWithResult<null>("update_google_calendar_event", {
        update,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });
}

export async function delete_google_calendar_event(
    params: DeleteGoogleCalendarEvent
): Promise<Result<null, AppError>> {
    if (!hasGoogleOAuthCredentials()) {
        return {
            success: false,
            error: {
                type: "Other",
                data: "Google OAuth credentials not set"
            }
        };
    }
    return invokeWithResult<null>("delete_google_calendar_event", {
        params,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });
}
