import {
  branchPageSchema,
  branchSchema,
  businessPageSchema,
  businessSchema,
  businessUserPageSchema,
  businessUserSchema,
  createdBusinessSchema,
  invitationDeliverySchema,
  invitedUserSchema,
  qrLinkSchema,
  sessionActorSchema,
  type Branch,
  type Business,
  type BusinessUser,
  type CreateBranchRequest,
  type CreateBusinessRequest,
  type CreatedBusiness,
  type InvitationDelivery,
  type InvitedUser,
  type InviteUserRequest,
  type LoginRequest,
  type Page,
  type QrLink,
  type RoleTarget,
  type SessionActor,
  type UpdateBranchRequest,
  type UpdateBusinessRequest,
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
  const id = encodeURIComponent;
  const withCursor = (path: string, cursor: string | undefined) =>
    cursor === undefined ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
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
      return call(at("GET", withCursor("/admin/businesses", cursor)), businessPageSchema);
    },

    /**
     * A new business with its subdomain and its first admin restaurante, who gets an
     * invitation by email (superadmin only). `invitation.sent` is false when the mail
     * provider failed: the invitation can be sent again from the team.
     */
    createBusiness(business: CreateBusinessRequest): Promise<CreatedBusiness> {
      return call(json("POST", "/admin/businesses", business), createdBusinessSchema);
    },

    business(businessId: string): Promise<Business> {
      return call(at("GET", `/admin/businesses/${id(businessId)}`), businessSchema);
    },

    /** A 409 SUBDOMAIN_TAKEN when another business holds it; the old one stays as an alias. */
    updateBusiness(businessId: string, update: UpdateBusinessRequest): Promise<Business> {
      return call(json("PATCH", `/admin/businesses/${id(businessId)}`, update), businessSchema);
    },

    /** The branches this person reaches: all of them, or the ones they run. */
    branches(businessId: string, cursor?: string): Promise<Page<Branch>> {
      return call(
        at("GET", withCursor(`/admin/businesses/${id(businessId)}/branches`, cursor)),
        branchPageSchema,
      );
    },

    /** A 409 SLUG_TAKEN or SUBDOMAIN_TAKEN when the address is someone else's. */
    createBranch(businessId: string, branch: CreateBranchRequest): Promise<Branch> {
      return call(json("POST", `/admin/businesses/${id(businessId)}/branches`, branch), branchSchema);
    },

    branch(branchId: string): Promise<Branch> {
      return call(at("GET", `/admin/branches/${id(branchId)}`), branchSchema);
    },

    /** `subdomain: null` removes the branch's own subdomain; old addresses stay as aliases. */
    updateBranch(branchId: string, update: UpdateBranchRequest): Promise<Branch> {
      return call(json("PATCH", `/admin/branches/${id(branchId)}`, update), branchSchema);
    },

    /** The branch's QR code and the short link it holds (ADR-0010). */
    branchQr(branchId: string): Promise<QrLink> {
      return call(at("GET", `/admin/branches/${id(branchId)}/qr`), qrLinkSchema);
    },

    /** The business's people with their roles there (admin restaurante and superadmin). */
    team(businessId: string, cursor?: string): Promise<Page<BusinessUser>> {
      return call(
        at("GET", withCursor(`/admin/businesses/${id(businessId)}/users`, cursor)),
        businessUserPageSchema,
      );
    },

    /** Gives someone a role by email: an invitation if they are new to Miramenu (ADR-0023). */
    inviteUser(businessId: string, invitation: InviteUserRequest): Promise<InvitedUser> {
      return call(json("POST", `/admin/businesses/${id(businessId)}/users`, invitation), invitedUserSchema);
    },

    /** Replaces the person's roles in this business. */
    setRoles(businessId: string, userId: string, roles: RoleTarget[]): Promise<BusinessUser> {
      return call(
        json("PUT", `/admin/businesses/${id(businessId)}/users/${id(userId)}/roles`, { roles }),
        businessUserSchema,
      );
    },

    /** Takes away every role the person has in this business. */
    removeRoles(businessId: string, userId: string): Promise<void> {
      return act(at("DELETE", `/admin/businesses/${id(businessId)}/users/${id(userId)}/roles`));
    },

    /**
     * Sends the invitation again, which voids the one before (ADR-0023). A 409
     * USER_ALREADY_ACTIVE once the person has set their password.
     */
    resendInvitation(businessId: string, userId: string): Promise<InvitationDelivery> {
      return call(
        at("POST", `/admin/businesses/${id(businessId)}/users/${id(userId)}/invitation`),
        invitationDeliverySchema,
      );
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
