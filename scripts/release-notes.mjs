import {readFileSync, appendFileSync} from "node:fs";
import {releaseBody, releaseNotes} from "./changelog.mjs";
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const notes = releaseNotes(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), version);
if (!notes.length) throw new Error(`What's New for ${version} is empty. Add "- " notes under ## [${version}] in CHANGELOG.md.`);
const body = releaseBody(notes);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `body<<RELEASE_NOTES\n${body}\nRELEASE_NOTES\n`);
else console.log(body);
