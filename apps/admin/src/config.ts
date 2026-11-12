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

const adminEnvironment = z.object({
  /** The API's own host, the same site as the admin app (ADR-0045). */
  VITE_API_URL: bareOrigin,
});

export interface AdminConfig {
  apiUrl: string;
}

/**
 * Read once: by vite.config at build time, so a missing variable fails the build and not
 * an admin's screen, and by the app when it starts. Errors name variables, never values.
 */
export function parseAdminConfig(
  env: Readonly<Record<string, string | undefined>>,
): AdminConfig {
  const parsed = adminEnvironment.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid admin configuration: ${names.join(", ")}`);
  }
  return { apiUrl: parsed.data.VITE_API_URL };
}
