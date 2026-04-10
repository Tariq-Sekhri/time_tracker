import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
    root: path.resolve(dir, ".."),
    base: "./",
    plugins: [react(), tailwindcss()],
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
