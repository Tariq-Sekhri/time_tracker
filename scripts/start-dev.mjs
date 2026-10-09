import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

// Tauri flags precede `--`; the optimized, isolated Cargo profile follows it.
// Use Node directly so Windows shell argument forwarding cannot drop the separator.
const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
const child = spawn(process.execPath, [cli, "dev", ...process.argv.slice(2), "--", "--profile", "performance"], {stdio: "inherit"});
child.on("error", error => {console.error(error); process.exitCode = 1;});
child.on("exit", code => {process.exitCode = code ?? 1;});
