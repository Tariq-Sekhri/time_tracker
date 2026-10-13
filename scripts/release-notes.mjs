import {readFileSync, appendFileSync} from "node:fs";
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const section = changelog.split(`## [${version}]`)[1]?.split(/\n## /)[0];
const notes = section?.split("\n").slice(1).join("\n").trim();
if (!notes) throw new Error(`Missing changelog for ${version}`);
const body = `${notes}\n\nInstallers for Windows (.exe) and Linux (.deb) are in Assets. .sig and latest.json are used for automatic updates.`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `body<<RELEASE_NOTES\n${body}\nRELEASE_NOTES\n`);
else console.log(body);
