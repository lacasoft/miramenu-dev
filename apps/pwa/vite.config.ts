import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { parsePwaConfig } from "./src/config.ts";

/** The repo's root .env, shared with the API and the scripts. */
const envDir = fileURLToPath(new URL("../..", import.meta.url));

/** Tests never read .env: the screens get their API through a fake client. */
const TEST_ENV = {
  VITE_API_URL: "https://api.example.test",
  VITE_PUBLIC_SITE_URL: "https://example.test",
};

export default defineConfig(({ mode }) => {
  // A missing or malformed variable fails here, at build time, not on the diner's screen.
  const config = parsePwaConfig(
    mode === "test" ? TEST_ENV : loadEnv(mode, envDir, "VITE_"),
  );
  // Every restaurant subdomain of the public site reaches the dev server (ADR-0029).
  const server = {
    port: 5173,
    strictPort: true,
    allowedHosts: [`.${config.siteHostname}`],
  };
  return {
    envDir,
    plugins: [react()],
    server,
    preview: server,
    test: {
      environment: "jsdom",
      env: TEST_ENV,
    },
  };
});
