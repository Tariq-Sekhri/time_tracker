import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is supplied by Node when Vite loads its config.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
    root: "mobile",
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {port: 5174, strictPort: true, host: host || "127.0.0.1"},
    build: {outDir: "../dist-mobile", emptyOutDir: true},
});
