use crate::db;
use crate::db::Error;
use crate::db::tables::google_calendar::{
    get_google_calendar_by_id, get_google_calendars, GoogleCalendar, GoogleCalendarInfo,
};
use crate::google_oauth::get_valid_access_token;
use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};

const GOOGLE_API_BASE: &str = "https://www.googleapis.com/calendar/v3";

// Google Calendar API response types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleCalendarEvent {
    pub calendar_id: i32, // Our internal ID
    pub event_id: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub description: Option<String>,
    pub location: Option<String>,
}

#[derive(Deserialize)]
pub struct GetGoogleCalendarEventsParams {
    #[serde(rename = "calendarId")]
    pub calendar_id: i32,
    #[serde(rename = "startTime")]
    pub start_time: i64,
    #[serde(rename = "endTime")]
    pub end_time: i64,
}

#[derive(Deserialize)]
pub struct GetAllGoogleCalendarEventsParams {
    #[serde(rename = "startTime")]
    pub start_time: i64,
    #[serde(rename = "endTime")]
    pub end_time: i64,
}

#[derive(Deserialize)]
pub struct CreateGoogleCalendarEventParams {
    pub calendar_id: i32,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateGoogleCalendarEventParams {
    #[serde(rename = "calendar_id")]
    pub calendar_id: i32,
    #[serde(rename = "event_id")]
    pub event_id: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteGoogleCalendarEventParams {
    pub calendar_id: i32,
    pub event_id: String,
}

// Google API response structures
#[derive(Debug, Serialize, Deserialize)]
struct GoogleApiEvent {
    id: String,
    summary: Option<String>,
    description: Option<String>,
    location: Option<String>,
    start: GoogleApiEventTime,
    end: GoogleApiEventTime,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleApiEventTime {
    date_time: Option<String>,
    date: Option<String>,
    time_zone: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GoogleApiEventsResponse {
    items: Option<Vec<GoogleApiEvent>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleApiCalendarListItem {
    id: String,
    summary: String,
    background_color: Option<String>,
    access_role: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GoogleApiCalendarListResponse {
    items: Option<Vec<GoogleApiCalendarListItem>>,
}

/// Fetch available calendars from Google Calendar API
#[tauri::command]
pub async fn list_available_google_calendars(
    client_id: String,
    client_secret: String,
) -> Result<Vec<GoogleCalendarInfo>, Error> {
    let access_token = get_valid_access_token(&client_id, &client_secret).await?;
    
    // Get currently selected calendars
    let selected_calendars = get_google_calendars().await?;
    let selected_ids: std::collections::HashSet<String> = selected_calendars
        .iter()
        .map(|c| c.google_calendar_id.clone())
        .collect();

    let client = reqwest::Client::new();
    let url = format!("{}/users/me/calendarList", GOOGLE_API_BASE);
    
    let response = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| Error::Other(format!("Failed to fetch calendar list: {}", e)))?;

    let status = response.status();
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(Error::Other(format!("Calendar list API returned error {}: {}", status, error_text)));
    }

    let calendar_list: GoogleApiCalendarListResponse = response
        .json()
        .await
        .map_err(|e| Error::Other(format!("Failed to parse calendar list: {}", e)))?;

    let calendars: Vec<GoogleCalendarInfo> = calendar_list
        .items
        .unwrap_or_default()
        .into_iter()
        .map(|item| GoogleCalendarInfo {
            google_calendar_id: item.id.clone(),
            name: item.summary,
            color: item.background_color.unwrap_or_else(|| "#4285f4".to_string()),
            access_role: item.access_role,
            selected: selected_ids.contains(&item.id),
        })
        .collect();

    Ok(calendars)
}

/// Internal function that fetches events from Google Calendar API
async fn fetch_google_calendar_events_internal(
    calendar: &GoogleCalendar,
    start_time: i64,
    end_time: i64,
    client_id: &str,
    client_secret: &str,
) -> Result<Vec<GoogleCalendarEvent>, Error> {
    let access_token = get_valid_access_token(client_id, client_secret).await?;

    // Convert timestamps to RFC3339
    let time_min = DateTime::<Utc>::from_timestamp(start_time, 0)
        .ok_or_else(|| Error::Other("Invalid start time".to_string()))?
        .to_rfc3339();
    let time_max = DateTime::<Utc>::from_timestamp(end_time, 0)
        .ok_or_else(|| Error::Other("Invalid end time".to_string()))?
        .to_rfc3339();

    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "{}/calendars/{}/events",
            GOOGLE_API_BASE,
            urlencoding::encode(&calendar.google_calendar_id)
        ))
        .bearer_auth(&access_token)
        .query(&[
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .send()
        .await
        .map_err(|e| Error::Other(format!("Failed to fetch events: {}", e)))?;

    let events_response: GoogleApiEventsResponse = response
        .json()
        .await
        .map_err(|e| Error::Other(format!("Failed to parse events: {}", e)))?;

    let events = events_response
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|event| {
            // Filter out all-day events - they have date instead of date_time
            // All-day events are identified by having date field set and dateTime field as None
            let is_all_day = event.start.date_time.is_none() && event.start.date.is_some()
                || event.end.date_time.is_none() && event.end.date.is_some();
            
            if is_all_day {
                return None;
            }

            // Only process events that have dateTime (not all-day events)
            if event.start.date_time.is_none() || event.end.date_time.is_none() {
                return None;
            }

            // Parse start and end times
            let start = parse_event_time(&event.start)?;
            let end = parse_event_time(&event.end)?;

            // Filter out all-day events that have dateTime set to midnight
            // All-day events are typically from 12:00 a.m. to 12:00 a.m. (midnight to midnight)
            let start_time = start.time();
            let end_time = end.time();
            let start_date = start.date_naive();
            let end_date = end.date_naive();
            
            // Check if both start and end are at midnight (00:00:00)
            let is_midnight_start = start_time.hour() == 0 && start_time.minute() == 0 && start_time.second() == 0;
            let is_midnight_end = end_time.hour() == 0 && end_time.minute() == 0 && end_time.second() == 0;
            
            // If both are at midnight and on the same day (or end is next day at midnight), it's an all-day event
            if is_midnight_start && is_midnight_end {
                let duration = end_date.signed_duration_since(start_date);
                // Same day (duration 0) or exactly 1 day difference (duration 1) = all-day event
                if duration.num_days() == 0 || duration.num_days() == 1 {
                    return None;
                }
            }

            Some(GoogleCalendarEvent {
                calendar_id: calendar.id,
                event_id: event.id,
                title: event.summary.unwrap_or_else(|| "(No title)".to_string()),
                start: start.timestamp(),
                end: end.timestamp(),
                description: event.description,
                location: event.location,
            })
        })
        .collect();

    Ok(events)
}

/// Parse Google API event time to DateTime
fn parse_event_time(time: &GoogleApiEventTime) -> Option<DateTime<Utc>> {
    if let Some(date_time) = &time.date_time {
        DateTime::parse_from_rfc3339(date_time)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    } else if let Some(date) = &time.date {
        // All-day event - use start of day
        DateTime::parse_from_rfc3339(&format!("{}T00:00:00Z", date))
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    } else {
        None
    }
}

/// Fetch events for a specific calendar
#[tauri::command]
pub async fn get_google_calendar_events(
    params: GetGoogleCalendarEventsParams,
    client_id: String,
    client_secret: String,
) -> Result<Vec<GoogleCalendarEvent>, Error> {
    let calendar = get_google_calendar_by_id(params.calendar_id).await?;
    fetch_google_calendar_events_internal(
        &calendar,
        params.start_time,
        params.end_time,
        &client_id,
        &client_secret,
    )
    .await
}

/// Fetch events for all calendars
#[tauri::command]
pub async fn get_all_google_calendar_events(
    params: GetAllGoogleCalendarEventsParams,
    client_id: String,
    client_secret: String,
) -> Result<Vec<GoogleCalendarEvent>, Error> {
    let calendars = get_google_calendars().await?;
    let mut all_events = Vec::new();

    for calendar in calendars {
        match fetch_google_calendar_events_internal(
            &calendar,
            params.start_time,
            params.end_time,
            &client_id,
            &client_secret,
        )
        .await
        {
            Ok(mut events) => all_events.append(&mut events),
            Err(_) => {
                // Continue with other calendars
            }
        }
    }

    Ok(all_events)
}

/// Create a new Google Calendar event
#[tauri::command]
pub async fn create_google_calendar_event(
    params: CreateGoogleCalendarEventParams,
    client_id: String,
    client_secret: String,
) -> Result<String, Error> {
    let calendar = get_google_calendar_by_id(params.calendar_id).await?;
    let access_token = get_valid_access_token(&client_id, &client_secret).await?;

    // Convert timestamps to RFC3339
    let start = DateTime::<Utc>::from_timestamp(params.start, 0)
        .ok_or_else(|| Error::Other("Invalid start time".to_string()))?
        .to_rfc3339();
    let end = DateTime::<Utc>::from_timestamp(params.end, 0)
        .ok_or_else(|| Error::Other("Invalid end time".to_string()))?
        .to_rfc3339();

    let event_body = serde_json::json!({
        "summary": params.title,
        "description": params.description,
        "start": {
            "dateTime": start,
            "timeZone": "UTC"
        },
        "end": {
            "dateTime": end,
            "timeZone": "UTC"
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/calendars/{}/events",
            GOOGLE_API_BASE,
            urlencoding::encode(&calendar.google_calendar_id)
        ))
        .bearer_auth(&access_token)
        .json(&event_body)
        .send()
        .await
        .map_err(|e| Error::Other(format!("Failed to create event: {}", e)))?;

    let created_event: GoogleApiEvent = response
        .json()
        .await
        .map_err(|e| Error::Other(format!("Failed to parse created event: {}", e)))?;

    Ok(created_event.id)
}

/// Update an existing Google Calendar event
#[tauri::command]
pub async fn update_google_calendar_event(
    update: UpdateGoogleCalendarEventParams,
    client_id: String,
    client_secret: String,
) -> Result<(), Error> {
    let calendar = get_google_calendar_by_id(update.calendar_id).await?;
    let access_token = get_valid_access_token(&client_id, &client_secret).await?;

    // Convert timestamps to RFC3339
    let start = DateTime::<Utc>::from_timestamp(update.start, 0)
        .ok_or_else(|| Error::Other("Invalid start time".to_string()))?
        .to_rfc3339();
    let end = DateTime::<Utc>::from_timestamp(update.end, 0)
        .ok_or_else(|| Error::Other("Invalid end time".to_string()))?
        .to_rfc3339();

    let event_body = serde_json::json!({
        "summary": update.title,
        "description": update.description,
        "start": {
            "dateTime": start,
            "timeZone": "UTC"
        },
        "end": {
            "dateTime": end,
            "timeZone": "UTC"
        }
    });

    let client = reqwest::Client::new();
    client
        .put(format!(
            "{}/calendars/{}/events/{}",
            GOOGLE_API_BASE,
            urlencoding::encode(&calendar.google_calendar_id),
            urlencoding::encode(&update.event_id)
        ))
        .bearer_auth(&access_token)
        .json(&event_body)
        .send()
        .await
        .map_err(|e| Error::Other(format!("Failed to update event: {}", e)))?;

    Ok(())
}

/// Delete a Google Calendar event
#[tauri::command]
pub async fn delete_google_calendar_event(
    params: DeleteGoogleCalendarEventParams,
    client_id: String,
    client_secret: String,
) -> Result<(), Error> {
    let calendar = get_google_calendar_by_id(params.calendar_id).await?;
    let access_token = get_valid_access_token(&client_id, &client_secret).await?;

    let client = reqwest::Client::new();
    client
        .delete(format!(
            "{}/calendars/{}/events/{}",
            GOOGLE_API_BASE,
            urlencoding::encode(&calendar.google_calendar_id),
            urlencoding::encode(&params.event_id)
        ))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| Error::Other(format!("Failed to delete event: {}", e)))?;

    Ok(())
}
