import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    // Allow the sandbox / tunnel hostnames used by live previews.
    allowedHosts: true,
    proxy: {
      // Optional: run the server-side endpoint locally (port 8788) in another
      // terminal to exercise the real leaderboard from `npm run dev`.
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
