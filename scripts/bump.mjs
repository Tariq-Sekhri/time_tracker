import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BUMP_TYPES = {
  major: "major",
  ma: "major",
  minor: "minor",
  mi: "minor",
  patch: "patch",
  p: "patch",
};

function usage() {
  console.error("Usage: bump <major|ma|minor|mi|patch|p>");
  process.exit(1);
}

const arg = process.argv[2]?.toLowerCase();
const bumpType = BUMP_TYPES[arg];
if (!bumpType) {
  usage();
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(version, type) {
  const v = parseVersion(version);
  switch (type) {
    case "major":
      return `${v.major + 1}.0.0`;
    case "minor":
      return `${v.major}.${v.minor + 1}.0`;
    case "patch":
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function replaceAll(path, from, to) {
  const content = readFileSync(path, "utf8");
  if (!content.includes(from)) {
    throw new Error(`${path} does not contain version "${from}"`);
  }
  writeFileSync(path, content.replaceAll(from, to));
}

function replaceRegex(path, pattern, replacement) {
  const content = readFileSync(path, "utf8");
  if (!pattern.test(content)) {
    throw new Error(`${path} does not match expected version pattern`);
  }
  pattern.lastIndex = 0;
  writeFileSync(path, content.replace(pattern, replacement));
}

const mainPackageJson = join(root, "package.json");
const currentVersion = readJson(mainPackageJson).version;
const newVersion = bumpVersion(currentVersion, bumpType);
const newDemoVersion = `${newVersion}-demo`;

const demoPackageJson = join(root, "demo", "package.json");
const oldDemoVersion = readJson(demoPackageJson).version;

const updatedFiles = [
  "package.json",
  "package-lock.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/tauri.conf.json",
  "demo/package.json",
  "demo/package-lock.json",
  "demo/mock/core.ts",
];

const mainPackageData = readJson(mainPackageJson);
mainPackageData.version = newVersion;
writeJson(mainPackageJson, mainPackageData);

replaceAll(join(root, "package-lock.json"), currentVersion, newVersion);

replaceRegex(
  join(root, "src-tauri", "Cargo.toml"),
  /^version = "[^"]+"$/m,
  `version = "${newVersion}"`
);

replaceRegex(
  join(root, "src-tauri", "Cargo.lock"),
  /(name = "time-tracker"\r?\nversion = ")[^"]+(")/,
  `$1${newVersion}$2`
);

const tauriConf = readJson(join(root, "src-tauri", "tauri.conf.json"));
tauriConf.version = newVersion;
writeJson(join(root, "src-tauri", "tauri.conf.json"), tauriConf);

const demoPackageData = readJson(demoPackageJson);
demoPackageData.version = newDemoVersion;
writeJson(demoPackageJson, demoPackageData);

replaceAll(join(root, "demo", "package-lock.json"), oldDemoVersion, newDemoVersion);
replaceAll(
  join(root, "demo", "mock", "core.ts"),
  `"${oldDemoVersion}"`,
  `"${newDemoVersion}"`
);

console.log(`Bumped ${currentVersion} -> ${newVersion} (${bumpType})`);
console.log(`Demo version ${oldDemoVersion} -> ${newDemoVersion}`);
console.log("");
console.log("Updated:");
for (const file of updatedFiles) {
  console.log(`  ${file}`);
}
