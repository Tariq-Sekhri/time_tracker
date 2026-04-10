import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const rust = fs.readFileSync(
    path.join(root, "src-tauri/src/db/tables/cat_regex.rs"),
    "utf8"
);
const start = rust.indexOf("const DEFAULT_REGEXES");
const slice = rust.slice(start);
const eqArr = slice.indexOf("= &[");
const open = eqArr >= 0 ? eqArr + 4 : slice.indexOf("[") + 1;
let depth = 1;
let j = open;
for (; j < slice.length && depth > 0; j++) {
    if (slice[j] === "[") depth++;
    else if (slice[j] === "]") depth--;
}
const body = slice.slice(open, j);
const rows = [];
for (const line of body.split("\n")) {
    const t = line.trim();
    const m = t.match(/^\(\s*"[^"]*",\s*"([^"]+)",\s*(.+)\)\s*,\s*$/);
    if (!m) continue;
    const cat = m[1];
    const rhs = m[2].trim();
    let pat;
    if (rhs.startsWith('r"') && rhs.endsWith('"')) {
        pat = rhs.slice(2, -1);
    } else if (rhs.startsWith('"') && rhs.endsWith('"')) {
        pat = JSON.parse(rhs);
    } else continue;
    rows.push({ category: cat, regex: pat });
}

const cats = [
    ["Miscellaneous", 0, "#9c9c9c"],
    ["Browsing", 200, "#ff7300"],
    ["Music", 250, "#ec4899"],
    ["Reading", 300, "#a855f7"],
    ["Learning", 380, "#eab308"],
    ["Coding", 400, "#1100ff"],
    ["Gaming", 500, "#2eff89"],
    ["Watching", 600, "#fff700"],
    ["Social", 700, "#5662f6"],
];
const skipped = [
    "^$",
    "^Windows Default Lock Screen$",
    "^Task View$",
    "^Search$",
    "^Task Switching$",
    "^System tray overflow window\\.$",
    "^Program Manager$",
];
const nameToId = Object.fromEntries(cats.map((c, i) => [c[0], i + 1]));
const regexRows = rows.map((r, idx) => ({
    id: idx + 1,
    cat_id: nameToId[r.category],
    regex: r.regex,
}));

let out =
    "export const DEMO_DEFAULT_CATEGORIES = " +
    JSON.stringify(
        cats.map((c, i) => ({
            id: i + 1,
            name: c[0],
            priority: c[1],
            color: c[2],
        })),
        null,
        2
    ) +
    " as const;\n\n";
out +=
    "export const DEMO_DEFAULT_SKIPPED_REGEXES = " +
    JSON.stringify(skipped, null, 2) +
    " as const;\n\n";
out +=
    "export const DEMO_DEFAULT_CAT_REGEX = " +
    JSON.stringify(regexRows, null, 2) +
    " as const;\n";

fs.writeFileSync(path.join(__dirname, "defaultSeedData.ts"), out);
console.log("wrote", regexRows.length, "regex rows");
