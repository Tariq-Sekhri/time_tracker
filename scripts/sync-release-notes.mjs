// Rewrites published GitHub release notes to match CHANGELOG.md, so notes can be fixed after release.
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {releaseBody, releaseNotes, releasedVersions} from "./changelog.mjs";

const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const gh = (...args) => execFileSync("gh", args, {encoding: "utf8"});
const published = new Set(JSON.parse(gh("release", "list", "--limit", "200", "--json", "tagName")).map((release) => release.tagName));
for (const version of releasedVersions(changelog)) {
    const tag = `app-v${version}`;
    const notes = releaseNotes(changelog, version);
    if (!published.has(tag) || !notes.length) continue;
    const body = releaseBody(notes);
    const current = JSON.parse(gh("release", "view", tag, "--json", "body")).body.replace(/\r\n/g, "\n").trim();
    if (current === body.trim()) continue;
    gh("release", "edit", tag, "--notes", body);
    console.log(`Updated release notes for ${tag}`);
}
