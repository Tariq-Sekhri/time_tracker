export const AFK_SOURCES = [
    {id: "input", label: "Windows input timer", group: "input", note: "All input in this Windows session, including short taps."},
    {id: "mouse", label: "Mouse movement / buttons", group: "input", note: "Motion and held buttons. No cursor positions are stored."},
    {id: "keyboard", label: "Keyboard activity", group: "input", note: "Held-key presence sampled each second; short taps may be missed. No key contents stored."},
    {id: "controller", label: "Controller activity", group: "input", note: "XInput controllers with stick dead zones. Disconnected controllers are unavailable."},
    {id: "media", label: "Any media playback", group: "media", note: "Registered Windows media sessions reporting Playing, including background music."},
    {id: "foreground_media", label: "Foreground playback app", group: "media", note: "Playing session matches the foreground app. Browser tab visibility and video versus music may be unknown."},
    {id: "audio", label: "Audio output", group: "media", note: "Default output amplitude only. Silent video may have no output. No audio is recorded."},
    {id: "fullscreen", label: "Fullscreen window", group: "fullscreen", note: "The foreground window covers a monitor. This alone does not prove someone is watching."},
    {id: "locked", label: "Locked desktop", group: "locked", note: "An observed lock is an away vote. An inaccessible desktop is unknown."},
    {id: "screensaver", label: "Screensaver running", group: "screensaver", note: "An active screensaver is an away vote."},
    {id: "video", label: "Video playback", group: "media", note: "Playing media sessions reporting Video. Players that omit their media type are unknown."},
] as const;
export type SourceSetting = {enabled: boolean; weight: number; timeout_seconds: number; absence_is_away: boolean};
export type AfkSettings = {
    enabled: boolean; minimum_sources: number; away_threshold: number;
    enter_delay_seconds: number; exit_delay_seconds: number;
    group_related_sources: boolean; locked_is_away: boolean; sources: SourceSetting[];
};
export const defaultAfkSettings = (): AfkSettings => ({
    enabled: true, minimum_sources: 1, away_threshold: 65, enter_delay_seconds: 30, exit_delay_seconds: 0,
    group_related_sources: true, locked_is_away: true,
    sources: AFK_SOURCES.map((_, i) => ({enabled: true, weight: [60,60,60,80,90,100,20,20,100,90,100][i], timeout_seconds: i === 6 ? 5 : 300, absence_is_away: i === 0})),
});
export type Observation = {available: boolean; active: boolean; idle_seconds: number | null; detail: string};
export type Decision = {state: "present" | "afk" | "unknown"; away_score: number; agreeing_sources: number; away_weight: number; present_weight: number; known_mask: number; active_mask: number};
export type AfkStatus = {timestamp: number; observations: Observation[]; decision: Decision; recording: boolean; storage_error: string | null; simulated?: boolean};
export type AfkInterval = {device_uuid: string; start_time: number; end_time: number; state: number; known_mask: number; active_mask: number; settings_id: number};
export type AfkStorage = {intervals: number; afk_seconds: number; allocated_bytes: number | null; activity_rows: number};

/** Instant preview of proposed settings. Native classification additionally applies entry/exit delays. */
export function evaluateAfk(settings: AfkSettings, observations: Observation[]): Decision {
    const groups = new Map<string, {away: number; present: number}>();
    let known_mask = 0, active_mask = 0, locked = false;
    settings.sources.forEach((s, i) => {
        const o = observations[i]; if (!o?.available) return;
        known_mask |= 1 << i;
        const active = o.idle_seconds === null ? o.active : o.idle_seconds < s.timeout_seconds;
        if (active) active_mask |= 1 << i;
        if (!s.enabled || s.weight === 0) return;
        const key = settings.group_related_sources ? AFK_SOURCES[i].group : String(i);
        const group = groups.get(key) ?? {away: 0, present: 0};
        if (i === 8 || i === 9) {if (active) {group.away = Math.max(group.away, s.weight); locked ||= i === 8;}}
        else if (active) group.present = Math.max(group.present, s.weight);
        else if (s.absence_is_away) group.away = Math.max(group.away, s.weight);
        groups.set(key, group);
    });
    let away_weight = 0, present_weight = 0, agreeing_sources = 0;
    groups.forEach(g => {present_weight += g.present; if (!g.present && g.away) {away_weight += g.away; agreeing_sources++;}});
    const away_score = away_weight + present_weight ? Math.floor(away_weight * 100 / (away_weight + present_weight)) : 0;
    const state = !settings.enabled || away_weight + present_weight === 0 ? "unknown"
        : (settings.locked_is_away && locked) || (agreeing_sources >= settings.minimum_sources && away_score >= settings.away_threshold) ? "afk"
        : present_weight ? "present" : "unknown";
    return {state, away_score, agreeing_sources, away_weight, present_weight, known_mask, active_mask};
}
