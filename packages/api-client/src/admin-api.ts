import {
  branchPageSchema,
  branchSchema,
  businessMenuDraftSchema,
  businessPageSchema,
  businessSchema,
  businessUserPageSchema,
  businessUserSchema,
  categorySchema,
  createdBusinessSchema,
  createdMediaSchema,
  dishSchema,
  IDEMPOTENCY_KEY_HEADER,
  invitationDeliverySchema,
  invitedUserSchema,
  mediaPageSchema,
  mediaSchema,
  profileSchema,
  publicationSchema,
  qrLinkSchema,
  sessionActorSchema,
  type Branch,
  type Business,
  type BusinessMenuDraft,
  type BusinessUser,
  type Category,
  type CreateBranchRequest,
  type CreateBusinessRequest,
  type CreateCategoryRequest,
  type CreatedBusiness,
  type CreatedMedia,
  type CreateMediaRequest,
  type CreateDishRequest,
  type Dish,
  type InvitationDelivery,
  type InvitedUser,
  type InviteUserRequest,
  type LoginRequest,
  type Media,
  type Page,
  type Profile,
  type Publication,
  type PublishBusinessMenuRequest,
  type PutProfileRequest,
  type QrLink,
  type RoleTarget,
  type SessionActor,
  type UpdateBranchRequest,
  type UpdateBusinessRequest,
  type UpdateCategoryRequest,
  type UpdateDishRequest,
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
     * The business's base menu as it stands in the draft, with the conflicts publishing it
     * would cause with its branches' adjustments (ADR-0036). Its branch admins may read it.
     */
    menuDraft(businessId: string): Promise<BusinessMenuDraft> {
      return call(at("GET", `/admin/businesses/${id(businessId)}/menu-draft`), businessMenuDraftSchema);
    },

    /** Replaces the profile; a missing logoId detaches the logo, so send the current one. */
    putProfile(businessId: string, profile: PutProfileRequest): Promise<Profile> {
      return call(json("PUT", `/admin/businesses/${id(businessId)}/profile`, profile), profileSchema);
    },

    /** A 409 MENU_LIMIT_REACHED past the business's categories. */
    createCategory(businessId: string, category: CreateCategoryRequest): Promise<Category> {
      return call(json("POST", `/admin/businesses/${id(businessId)}/categories`, category), categorySchema);
    },

    updateCategory(businessId: string, categoryId: string, update: UpdateCategoryRequest): Promise<Category> {
      return call(
        json("PATCH", `/admin/businesses/${id(businessId)}/categories/${id(categoryId)}`, update),
        categorySchema,
      );
    },

    /** A 409 CATEGORY_IN_USE while it holds dishes, of the business or of a branch. */
    removeCategory(businessId: string, categoryId: string): Promise<void> {
      return act(at("DELETE", `/admin/businesses/${id(businessId)}/categories/${id(categoryId)}`));
    },

    /** A 404 CATEGORY_NOT_FOUND when its category is gone; 409 MENU_LIMIT_REACHED past the dishes. */
    createDish(businessId: string, dish: CreateDishRequest): Promise<Dish> {
      return call(json("POST", `/admin/businesses/${id(businessId)}/dishes`, dish), dishSchema);
    },

    updateDish(businessId: string, dishId: string, update: UpdateDishRequest): Promise<Dish> {
      return call(json("PATCH", `/admin/businesses/${id(businessId)}/dishes/${id(dishId)}`, update), dishSchema);
    },

    /** The branches' adjustments of it become conflicts until the business publishes. */
    removeDish(businessId: string, dishId: string): Promise<void> {
      return act(at("DELETE", `/admin/businesses/${id(businessId)}/dishes/${id(dishId)}`));
    },

    /**
     * Publishes the reviewed draft to every branch (ADR-0036). The same key retried gives
     * back the first publication, so a lost answer can be asked for again; the key with
     * another request is a 422 IDEMPOTENCY_KEY_REUSED. A 409 DRAFT_CHANGED,
     * PUBLICATION_CONFLICTS or PROFILE_REQUIRED says what to review first.
     */
    publishBusinessMenu(
      businessId: string,
      request: PublishBusinessMenuRequest,
      idempotencyKey: string,
    ): Promise<Publication> {
      const publish = json("POST", `/admin/businesses/${id(businessId)}/publications`, request);
      return call(
        { ...publish, headers: { ...publish.headers, [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
        publicationSchema,
      );
    },

    /**
     * A new medium of the business and a short PUT, signed with its type and size, to
     * upload the original straight to storage: the API never receives the bytes (ADR-0038).
     */
    createMedia(businessId: string, request: CreateMediaRequest): Promise<CreatedMedia> {
      return call(json("POST", `/admin/businesses/${id(businessId)}/media`, request), createdMediaSchema);
    },

    /**
     * Confirms the upload, which queues its optimization. Safe to repeat. A 409
     * MEDIA_NOT_UPLOADED before the file arrived; a 422 MEDIA_REJECTED when what arrived
     * is not what was signed, which fails the medium.
     */
    completeMedia(businessId: string, mediaId: string): Promise<Media> {
      return call(at("POST", `/admin/businesses/${id(businessId)}/media/${id(mediaId)}/complete`), mediaSchema);
    },

    /** The business's media that failed or are stalled, newest first, a page at a time. */
    mediaProblems(businessId: string, cursor?: string): Promise<Page<Media>> {
      const page = cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`;
      return call(at("GET", `/admin/businesses/${id(businessId)}/media?problem=true${page}`), mediaPageSchema);
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
