import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { parseAdminConfig } from "./src/config.ts";

/** The repo's root .env, shared with the API and the PWA. */
const envDir = fileURLToPath(new URL("../..", import.meta.url));

/** Tests never read .env: the screens get their API through a fake client. */
const TEST_ENV = { VITE_API_URL: "https://api.example.test" };

/** Where the API expects the admin app (ADMIN_APP_URL), so the dev server listens there. */
const DEV_ADMIN_URL = "http://admin.miramenu.localhost:5174";

export default defineConfig(({ mode }) => {
  // A missing or malformed variable fails here, at build time, not on an admin's screen.
  parseAdminConfig(mode === "test" ? TEST_ENV : loadEnv(mode, envDir, "VITE_"));
  const admin = new URL(
    loadEnv(mode, envDir, "ADMIN_APP_URL").ADMIN_APP_URL || DEV_ADMIN_URL,
  );
  const server = {
    port: Number(admin.port) || 5174,
    strictPort: true,
    allowedHosts: [admin.hostname],
  };
  return {
    envDir,
    plugins: [react()],
    server,
    preview: server,
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      env: TEST_ENV,
    },
  };
});
