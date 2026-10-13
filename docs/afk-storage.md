# AFK evidence and storage

The AFK recorder runs independently of activity logging. It stores a device,
time range, three-state decision, two signal masks, and a shared settings ID in
`afk_intervals`. Equal consecutive samples extend the same interval. Gaps are
left unknown; changing settings creates a separate configuration snapshot.
Original activity rows and sync payloads are unchanged. AFK evidence currently
stays local to Windows desktop; other platforms and downloaded device history
without evidence stay unknown.

The optional AFK filter subtracts overlapping AFK seconds from copies of logs
before aggregation. It uses device identity, preserves unknown time and manual
entries, and prevents calendar gap attachment from joining across an AFK gap.
Changing settings affects future decisions. Historical decisions retain their
original configuration rather than being silently rewritten.

## Measured storage

Run `python scripts/measure-afk-storage.py`. It creates SQLite databases in
memory using the shipped schema. These are synthetic 24-hour scenarios, including
table/index page allocation and one shared settings snapshot, not observations
of real signal-change frequency. WAL and backup overhead are not included.

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
