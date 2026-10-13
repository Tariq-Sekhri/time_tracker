# Changelog

## [Unreleased]

- Hide tracked activity during recorded AFK time by default, separately for each device.
- Sync AFK history with the server, including ongoing away periods.
- Show grouped AFK blocks when Include AFK is enabled.
- Use Include AFK to inspect away time, hidden by default. AFK periods follow the Timeblock detection rules in Settings.
- Preserve normal activity merging while excluding AFK, and keep other devices' activity and sync independent.
- Inspect an AFK block's recorded sources, confidence, and captured logs. AFK logs stay inside those blocks instead of normal activity.
- Show captured logs directly inside AFK calendar blocks, with expandable log fragments.
- Prevent short AFK recorder gaps from appearing as overnight activity, and keep title drill-downs AFK-filtered.
- Keep AFK cards within their actual calendar times; captured logs scroll inside shorter blocks.

## [1.12.1] - 2026-10-13

- Patch version update with no feature or behavior changes.

## [1.12.0] - 2026-10-13

- Added AFK detection with multiple sources and optional filtering.
- Redesigned and reorganized Settings.
- Calendar filters now preserve activity history.

## [1.11.11] - 2026-10-13

- Patch version update with no feature or behavior changes.

## [1.11.10] - 2026-10-13

- Drag on the calendar to preview a manual time entry, including future dates. Hold for a one-hour entry, then move or resize it. Single clicks keep their original behavior.
- Manual tracking now uses Categories instead of Projects for work, social, and personal time.
- See what's new after updating, with matching changelog notes on GitHub releases.
