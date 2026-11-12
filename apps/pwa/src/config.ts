import { z } from "zod";

/** An http(s) origin without a path, e.g. https://api.mirame.nu; a trailing slash is dropped. */
const bareOrigin = z
  .string()
  .transform((value) => value.replace(/\/+$/, ""))
  .refine((value) => {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && url.origin === value;
    } catch {
      return false;
    }
  }, "an http(s) origin without a path");

const pwaEnvironment = z.object({
  /** The API's own host, the same site as the PWA (ADR-0045). */
  VITE_API_URL: bareOrigin,
  /** The public site; restaurants live on its subdomains (ADR-0029). */
  VITE_PUBLIC_SITE_URL: bareOrigin,
});

export interface PwaConfig {
  apiUrl: string;
  siteHostname: string;
}

/**
 * Read once: by vite.config at build time, so a missing variable fails the build and not
 * the diner's screen, and by the app when it starts. Errors name variables, never values.
 */
export function parsePwaConfig(
  env: Readonly<Record<string, string | undefined>>,
): PwaConfig {
  const parsed = pwaEnvironment.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid PWA configuration: ${names.join(", ")}`);
  }
  return {
    apiUrl: parsed.data.VITE_API_URL,
    siteHostname: new URL(parsed.data.VITE_PUBLIC_SITE_URL).hostname,
  };
}
