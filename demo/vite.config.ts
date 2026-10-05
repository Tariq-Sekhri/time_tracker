import path from "node:path";
import {readFileSync} from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async ({command}) => ({
    root: path.resolve(dir, ".."),
    base: "./",
    plugins: [
        {
            name: "demo-network-isolation",
            transformIndexHtml: {
                order: "pre",
                handler: () => [
                    {tag: "meta", attrs: {"http-equiv": "Content-Security-Policy", content: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'${command === "serve" ? " ws://localhost:1420 ws://127.0.0.1:1420" : ""}; font-src 'self' data:; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'`}, injectTo: "head-prepend"},
                    {tag: "script", children: readFileSync(path.resolve(dir, "network-guard.js"), "utf8"), injectTo: "head"},
                ],
            },
        },
        react(), tailwindcss(),
    ],
    define: {"import.meta.env.VITE_DEMO": JSON.stringify("true")},
    clearScreen: false,
    resolve: {
        alias: {
            "@tauri-apps/api/core": path.resolve(dir, "mock/core.ts"),
            "@tauri-apps/api/event": path.resolve(dir, "mock/event.ts"),
            "@tauri-apps/api/window": path.resolve(dir, "mock/window.ts"),
        },
    },
    build: {
        outDir: path.resolve(dir, "dist"),
        emptyOutDir: true,
    },
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**", "data/**"],
        },
    },
}));
