import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { parsePwaConfig } from "./src/config.ts";
import { precachePlugin } from "./vite/precache-plugin.ts";

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
    // The service worker is built with the app, only for a build (ADR-0046).
    plugins: [react(), precachePlugin()],
    server,
    preview: server,
    test: {
      env: TEST_ENV,
      projects: [
        {
          extends: true,
          test: {
            name: "dom",
            include: ["src/**/*.test.{ts,tsx}"],
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
          },
        },
        {
          // The build's own plugins, run in a real Vite build.
          extends: true,
          test: {
            name: "build",
            include: ["vite/**/*.test.ts"],
            environment: "node",
          },
        },
      ],
    },
  };
});
