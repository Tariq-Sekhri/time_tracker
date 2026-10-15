// Shared by the release build, the pre-push check and the release-notes sync.
export const INSTALLER_NOTE = "Installers for Windows (.exe) and Linux (.deb) are in Assets. .sig and latest.json are used for automatic updates.";

/** The "- " bullets under `## [version]`, or an empty list when the section is missing or blank. */
export function releaseNotes(changelog, version) {
    const section = changelog.replace(/\r\n/g, "\n").split(`## [${version}]`)[1]?.split(/\n## /)[0] ?? "";
    return section.split("\n").slice(1).filter((line) => line.startsWith("- ") && line.slice(2).trim()).map((line) => line.slice(2).trim());
}

/** Every released (numbered) version in the changelog, newest first. */
export function releasedVersions(changelog) {
    return [...changelog.matchAll(/^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/gm)].map((match) => match[1]);
}

export function releaseBody(notes) {
    return `${notes.map((note) => `- ${note}`).join("\n")}\n\n${INSTALLER_NOTE}`;
}
