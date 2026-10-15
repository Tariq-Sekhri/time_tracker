# Agent instructions

## Git

- Stay on `master` (the main branch). Never create or switch to another branch unless explicitly told to.
- Commit frequently as work progresses, staging only the files you changed. Unrelated uncommitted changes in the working tree are the user's; leave them alone.
- Never push unless explicitly told to.

## Version bumps and changelog

- These version-bump, changelog, and What's New requirements apply only to desktop app releases in this repository. They do not apply to the sibling mobile or backend repositories.
- Desktop `CHANGELOG.md`, in-app What's New, and desktop GitHub release notes must describe only changes that affect desktop users. Exclude mobile-only and backend-only changes, including mobile-only code housed in this repository. Mention server requirements only when needed to explain a desktop feature.

- Before every version bump, review all commits and working-tree changes since the previous bump. Write a concise, user-facing summary of all desktop-relevant changes under `## [Unreleased]` in `CHANGELOG.md`.
- Run `npm run bump -- p` (or the requested bump type). The script requires unreleased notes and moves them into a dated version section.
- Keep `CHANGELOG.md` as the shared source for the in-app What's new message and GitHub release notes. Avoid implementation details and keep summaries short.

## Before pushing

- Always prepare What's New in `CHANGELOG.md` for all desktop changes being released, even for a patch release.
- Before actually pushing, show the user the exact What's New text and wait for their explicit confirmation. A request to push alone does not skip this review.
- Only push after the user confirms the displayed What's New. Include those approved notes in the release so the in-app What's New and GitHub release notes match.
- If the release scope or notes change after confirmation, show the updated What's New and get confirmation again before pushing.
- A `pre-push` hook (`.githooks/`, enabled by `npm install`) blocks pushing `master` when the What's New for the `package.json` version is empty. Never bypass it with `--no-verify`.
- Released notes can be corrected after the fact: edit that version's section in `CHANGELOG.md` and push (same confirmation rules). Installed apps read What's New from GitHub, and the release notes are updated to match; changelog-only pushes don't rebuild a release.
