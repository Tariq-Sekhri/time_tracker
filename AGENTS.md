# Agent instructions

## Git

- Stay on `master` (the main branch). Never create or switch to another branch unless explicitly told to.
- Commit frequently as work progresses, staging only the files you changed. Unrelated uncommitted changes in the working tree are the user's; leave them alone.
- Never push unless explicitly told to.

## Version bumps and changelog

- Before every version bump, review all commits and working-tree changes since the previous bump. Write a concise, user-facing summary of all changes under `## [Unreleased]` in `CHANGELOG.md`.
- Run `npm run bump -- p` (or the requested bump type). The script requires unreleased notes and moves them into a dated version section.
- Keep `CHANGELOG.md` as the shared source for the in-app What's new message and GitHub release notes. Avoid implementation details and keep summaries short.
