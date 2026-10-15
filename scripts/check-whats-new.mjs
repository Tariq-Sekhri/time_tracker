// Usage: node scripts/check-whats-new.mjs [git-ref]
// Fails when the What's New for the version at that commit (default: working tree) is empty.
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {releaseNotes} from "./changelog.mjs";

const ref = process.argv[2];
const read = (path) => ref
    ? execFileSync("git", ["show", `${ref}:${path}`], {encoding: "utf8"})
    : readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const version = JSON.parse(read("package.json")).version;
const notes = releaseNotes(read("CHANGELOG.md"), version);
if (!notes.length) {
    console.error(`\nPush blocked: What's New for ${version} is empty.`);
    console.error(`Add "- " notes under ## [${version}] in CHANGELOG.md, commit, and push again.\n`);
    process.exit(1);
}
console.log(`\nWhat's New for ${version}:`);
for (const note of notes) console.log(`  - ${note}`);
console.log("");
