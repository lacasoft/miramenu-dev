import {
  businessPageSchema,
  sessionActorSchema,
  type Business,
  type LoginRequest,
  type Page,
  type SessionActor,
} from "@miramenu/contracts";
import { isUnauthorized } from "./api-error.ts";
import { requester } from "./requester.ts";
import type { HttpRequest, Transport } from "./transport.ts";

export interface AdminApiOptions {
  /** The API's origin, e.g. https://api.mirame.nu (ADR-0045). */
  baseUrl: string;
  transport: Transport;
}

/**
 * The calls of the admin app (ADR-0047). Each answer is checked against its contract. The
 * browser adds the admin's session cookie; writes go as JSON, which costs a CORS preflight
 * that the API lets the browser keep for 10 minutes (ADR-0045).
 */
export function createAdminApi({ baseUrl, transport }: AdminApiOptions) {
  const origin = baseUrl.replace(/\/+$/, "");
  const { act, call } = requester(transport);
  const at = (method: HttpRequest["method"], path: string): HttpRequest => ({
    method,
    url: `${origin}${path}`,
    headers: {},
  });
  const json = (method: HttpRequest["method"], path: string, payload: unknown): HttpRequest => ({
    method,
    url: `${origin}${path}`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return {
    /**
     * Opens the admin's session; the API sets its cookie. A wrong email or password is a
     * 401 INVALID_CREDENTIALS, too many tries a 429 with how long to wait, and without
     * Redis a 503 LOGIN_UNAVAILABLE (ADR-0021).
     */
    signIn(credentials: LoginRequest): Promise<void> {
      return act(json("POST", "/admin/session", credentials));
    },

    /** Who is signed in and with which roles, or null without a session. */
    async session(): Promise<SessionActor | null> {
      try {
        return await call(at("GET", "/admin/session"), sessionActorSchema);
      } catch (error) {
        if (isUnauthorized(error)) return null;
        throw error;
      }
    },

    signOut(): Promise<void> {
      return act(at("DELETE", "/admin/session"));
    },

    /**
     * The businesses this person reaches, a page at a time: every one for the superadmin,
     * the ones where they hold a role otherwise.
     */
    businesses(cursor?: string): Promise<Page<Business>> {
      const path =
        cursor === undefined
          ? "/admin/businesses"
          : `/admin/businesses?cursor=${encodeURIComponent(cursor)}`;
      return call(at("GET", path), businessPageSchema);
    },

    /**
     * Sets the password of an invited admin. The token travels in the body, never in a URL
     * (ADR-0033); no session opens, so the admin signs in next. A used or replaced
     * invitation is a 404, an expired one a 410.
     */
    acceptInvitation(token: string, password: string): Promise<void> {
      return act(json("POST", "/admin/invitations/accept", { token, password }));
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
