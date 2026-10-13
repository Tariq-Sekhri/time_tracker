# AFK evidence and storage

The AFK recorder runs independently of activity logging. It stores a device,
time range, three-state decision, two signal masks, and a shared settings ID in
`afk_intervals`. Equal consecutive samples extend the same interval. Gaps are
left unknown; changing settings creates a separate configuration snapshot.
Original activity rows and log-sync payloads are unchanged. AFK evidence has its
own authenticated, incremental server sync. Detection currently supports Windows;
other platforms and device history without evidence stay unknown.

The AFK filter is enabled by default and subtracts overlapping AFK seconds from copies of logs
before aggregation. It uses device identity, preserves unknown time and manual
entries. The remaining activity uses the normal timeblock merging and attachment rules.
Changing settings affects future decisions. Historical decisions retain their
original configuration rather than being silently rewritten.

## Server sync

Updated desktops upload local evidence to `POST /v1/afk` and download evidence for
subscribed devices from `GET /v1/afk/{device_uuid}?after=<revision>`. Both routes
require an approved device's bearer token. The server assigns uploaded evidence
to the authenticated device; clients cannot upload another device's AFK state.
Existing desktop and Android log-sync requests remain compatible.

Pages contain at most 500 intervals. Uploads include the last acknowledged
interval again so an ongoing away period extends on the server. Replays do not
create duplicate records or shorten an interval. Downloads use independent
revision cursors, so changed evidence arrives even without new activity log IDs.
Downloaded source IDs are mapped to local interval IDs per device; settings
snapshots are deduplicated locally and never replace this desktop's settings.
Imports and download cursors commit in one transaction. An older server reports
an AFK sync error instead of silently treating evidence as synced.

Existing installs enable filtering once on upgrade; the control still allows
inspection of raw history. Include AFK shows grouped, labeled AFK calendar blocks.

The Include AFK control is off by default. Displayed away periods use the same
Timeblock detection pipeline and settings as activity blocks, separately per
device: minimum sample duration, short-sample attachment distance, lookahead gap
merging, and minimum observed duration. Only the display is grouped; filtering
and synced evidence retain exact original intervals, including present gaps.

## Measured storage

Run `python scripts/measure-afk-storage.py`. It creates SQLite databases in
memory using the recorder schema. These are synthetic 24-hour scenarios, including
table/index page allocation and one shared settings snapshot, not observations
of real signal-change frequency. Sync mapping/cursor, WAL, and backup overhead are not included.

| Evidence changes | Intervals / day | SQLite allocation |
| --- | ---: | ---: |
| Once per day | 1 | 20 KiB |
| Every 5 minutes | 288 | 56 KiB |
| Every 30 seconds | 2,880 | 364 KiB |
| Every 5 seconds | 17,280 | 2.05 MiB |
| Every second | 86,400 | 10.30 MiB |

A simple Boolean on 100,000 synthetic activity rows added only 32 KiB (14,823,424
versus 14,856,192 bytes). A flag alone is inexpensive. The sidecar exists to keep
time-aligned evidence and the settings behind a decision without changing the
activity schema or attaching large JSON records to each log.

The optional `--read-production <path>` opens SQLite with `mode=ro` and
`query_only=ON` and reads aggregates only. The October 13 snapshot contained
318,237 activity rows in a 73,269,248-byte database. No production rows or schema
were changed. Actual AFK growth needs observation after a release deployment;
Settings reports current AFK interval count and allocated pages when SQLite's
`dbstat` is available.

## Evidence limits

Eleven channels are supported: session input timer, mouse, keyboard, XInput
controller, any media playback, foreground playback app, audio output, fullscreen
window, locked session, screensaver, and declared video playback. Keyboard
presence is sampled, so short taps may be missed; the session input timer covers
those taps. Media type or foreground browser-tab visibility may be unavailable.
Audio output observes amplitude, not microphone data or audio contents. No key
contents, cursor positions, screenshots, or media titles are stored.

Weights, source enables, inactivity thresholds, silence-as-away rules, minimum
votes, entry/return delays, correlated groups, and lock override are configurable.
Unavailable sources never vote. Related input channels and media channels use
one strongest-weight vote per group by default, with presence winning inside a
group. A source weight of zero removes its vote but keeps its evidence collected.

Windows APIs: [session input timer](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getlastinputinfo),
[media-session playback](https://devblogs.microsoft.com/oldnewthing/20231108-00/?p=108980),
and [session lock flags](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/ns-wtsapi32-wtsinfoex_level1_w).

## Validation

Native tests exercise media weighting, unavailable/correlated signals, delays,
sampling gaps, partial overlap, device separation, query-scope isolation,
interval coalescing, configuration snapshots, and preservation of original rows.
An explicitly invoked read-only Windows probe detected registered playback and
read input, audio-meter, window, lock, and screensaver channels. Full lock/unlock,
controller, sleep/wake, and long-running installed-app recording still need live
release validation. Browser UI checks use clearly labelled simulated demo
evidence; they do not prove installed recorder behavior.
