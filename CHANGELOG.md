# Changelog

## [Unreleased]

- Track playing media in the background on Windows, including its title, artist, and app. Matching foreground activity is combined into one log, retaining the site name when available.

## [1.12.7] - 2026-10-21

- Fix the app sometimes closing unexpectedly when devices connect or go to sleep, drivers install, or VPN connections change.
- Support logs now record how the app last closed, including crashes, to help diagnose problems.
- The tracking toggle now matches your theme's colors.

## [1.12.6] - 2026-10-15

- Choose from 18 themes with Dark and Light modes and adjustable brightness.
- Added sorting rules for more games, including Counter-Strike 2, Warframe, ARK: Survival Ascended, and LinkedIn games.
- App Rules now opens to Regex by default.

## [1.12.5] - 2026-10-15

- Share the Notes editor and usage charts with the redesigned Android app.

## [1.12.4] - 2026-10-15

- Choose from six desktop themes, including light mode and extra-dark options, or create and share your own with detailed color controls.
- Settings is now organized into sections you can jump between.
- Add subcategories to manual categories (for example School › Homework, Study, In class). Pick them from a searchable picker; clicking a category opens its subcategories.
- Subcategory time counts toward its category in statistics, with the subcategory shown in the breakdown.
- Different categories can now have subcategories with the same name, and subcategories sync between devices. Requires an updated sync server.
- Sync notes between desktop and mobile, keep both versions of conflicting edits, and retain previous versions on the server.
- Select and copy images in notes, including with a right-click.
- What's New now picks up corrections made after a release.
- Fix new manual time blocks snapping back when dragged to another time or day.

## [1.12.3] - 2026-10-14

- Right-click an app log to see the regex that categorized it, then edit or delete it right there, or jump to it in App Rules with the rule focused.
- The manual timer now syncs live across your devices: start it on your phone and stop it on your desktop, or the other way round. Entries finished on another device appear in your calendar automatically. Requires an updated sync server; manual tracking still works offline.

## [1.12.2] - 2026-10-13

- Edit names and colors for categories, manual categories, and Google Calendars directly from the Sources sidebar; Uncategorized has an editable color and a fixed name.
- Adjust tracked category priority, with editors kept beside their source and inside the viewport even at increased UI scale.
- Hide tracked activity during recorded AFK time by default, separately for each device, and sync AFK history across devices.
- Use Include AFK to inspect grouped away blocks, their recorded sources, confidence, and captured logs without mixing those logs into normal activity.
- Fix overnight activity caused by short AFK recording gaps and keep AFK cards and captured logs within their calendar times.

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
