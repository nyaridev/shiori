import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The Hono server (server/main.ts) runs beside Vite in dev on 4411; Vite proxies the API to it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:4411", changeOrigin: true },
    },
  },
  test: {
    include: ["src/**/*.spec.ts", "server/**/*.spec.ts", "shared/**/*.spec.ts", "cli/**/*.spec.ts"],
  },
});
