import {
  branchInteractionsSchema,
  codeRequestedSchema,
  DEVICE_ID_HEADER,
  dinerSessionSchema,
  likeStateSchema,
  myLikesSchema,
  ownCommentPageSchema,
  ownCommentSchema,
  privacyNoticeSchema,
  publicCommentPageSchema,
  publishedMenuSchema,
  resolutionSchema,
  type BranchInteractions,
  type CodeRequested,
  type DinerSession,
  type LikeState,
  type MyLikes,
  type OwnComment,
  type Page,
  type PrivacyNotice,
  type PublicComment,
  type PublishedMenu,
  type Resolution,
  type VerifyCodeRequest,
} from "@miramenu/contracts";
import { ApiError, failureOf } from "./api-error.ts";
import type { HttpRequest, Transport } from "./transport.ts";

export interface DinerApiOptions {
  /** The API's origin, e.g. https://api.mirame.nu (ADR-0045). */
  baseUrl: string;
  transport: Transport;
  /** The device's anonymous id (ADR-0040), sent on the calls made as the device. */
  deviceId: () => string;
}

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * The calls of the diner's PWA. Each answer is checked against its contract, so a screen
 * never renders data the API did not promise.
 *
 * Reads carry no custom header: a cross-origin GET without one needs no CORS preflight,
 * which keeps the first card within RNF-01. The browser's own cache revalidates the menu
 * with its ETag (Cache-Control: public, no-cache). Calls made as the diner's device carry
 * its id; the browser adds the diner's session cookie, if any.
 */
export function createDinerApi({
  baseUrl,
  transport,
  deviceId,
}: DinerApiOptions) {
  const origin = baseUrl.replace(/\/+$/, "");

  /** Sends a request and gives back its status and body, or throws its failure. */
  async function exchange(request: HttpRequest) {
    let response;
    try {
      response = await transport(request);
    } catch {
      throw new ApiError({ kind: "network" });
    }
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new ApiError({ kind: "network" });
    }
    if (response.status < 200 || response.status >= 300)
      throw new ApiError(
        failureOf(response.status, body, response.header("retry-after")),
      );
    return { response, body };
  }

  /** A call whose answer carries nothing to read (204). */
  async function act(request: HttpRequest): Promise<void> {
    await exchange(request);
  }

  async function call<T>(request: HttpRequest, schema: Schema<T>): Promise<T> {
    const { response, body } = await exchange(request);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ApiError({ kind: "unexpected", status: response.status });
    }
    const result = schema.safeParse(parsed);
    if (!result.success)
      throw new ApiError({ kind: "unexpected", status: response.status });
    return result.data;
  }

  const get = <T>(path: string, schema: Schema<T>) =>
    call({ method: "GET", url: `${origin}${path}`, headers: {} }, schema);

  const asDevice = () => ({ [DEVICE_ID_HEADER]: deviceId() });
  const json = (method: HttpRequest["method"], path: string, payload: unknown) => ({
    method,
    url: `${origin}${path}`,
    headers: { "content-type": "application/json", ...asDevice() },
    body: JSON.stringify(payload),
  });
  const withCursor = (path: string, cursor: string | undefined) =>
    cursor === undefined ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
  const branchPath = (branchId: string) =>
    `/branches/${encodeURIComponent(branchId)}`;

  return {
    /** The branch behind a restaurant's subdomain and slug, aliases included. */
    resolve(address: {
      subdomain: string;
      slug?: string;
    }): Promise<Resolution> {
      const query = [`subdomain=${encodeURIComponent(address.subdomain)}`];
      if (address.slug !== undefined)
        query.push(`slug=${encodeURIComponent(address.slug)}`);
      return get(`/resolve?${query.join("&")}`, resolutionSchema);
    },

    /** The branch's latest published menu (ADR-0003). */
    menu(branchId: string): Promise<PublishedMenu> {
      return get(
        `/branches/${encodeURIComponent(branchId)}/menu`,
        publishedMenuSchema,
      );
    },

    /**
     * Sets the like of a dish, as the account if signed in, as the device otherwise.
     * Repeating it never adds a second like (ADR-0040).
     */
    like(branchId: string, dishId: string, active: boolean): Promise<LikeState> {
      return call(
        {
          method: "PUT",
          url: `${origin}${branchPath(branchId)}/dishes/${encodeURIComponent(dishId)}/like`,
          headers: { "content-type": "application/json", ...asDevice() },
          body: JSON.stringify({ active }),
        },
        likeStateSchema,
      );
    },

    /** Likes and approved comments per dish of the branch, for everyone. */
    interactions(branchId: string): Promise<BranchInteractions> {
      return get(`${branchPath(branchId)}/interactions`, branchInteractionsSchema);
    },

    /** The dishes this diner, or this device, likes in the branch. */
    myLikes(branchId: string): Promise<MyLikes> {
      return call(
        {
          method: "GET",
          url: `${origin}${branchPath(branchId)}/likes/mine`,
          headers: asDevice(),
        },
        myLikesSchema,
      );
    },

    /** The notice a registration must accept, and where to read it (ADR-0039). */
    privacyNotice(): Promise<PrivacyNotice> {
      return get("/privacy-notice", privacyNoticeSchema);
    },

    /** Sends a code to the phone; a 429 carries how long to wait (retryAfterSeconds). */
    requestCode(phone: string): Promise<CodeRequested> {
      return call(json("POST", "/registration/code", { phone }), codeRequestedSchema);
    },

    /** Checks the code and opens the diner's session; the API sets its cookie. */
    verify(registration: VerifyCodeRequest): Promise<DinerSession> {
      return call(json("POST", "/registration/verify", registration), dinerSessionSchema);
    },

    /** Who the diner is, or null without a session. */
    async session(): Promise<DinerSession | null> {
      try {
        return await call(
          { method: "GET", url: `${origin}/diner/session`, headers: asDevice() },
          dinerSessionSchema,
        );
      } catch (error) {
        if (error instanceof ApiError && error.failure.kind === "http" && error.failure.status === 401)
          return null;
        throw error;
      }
    },

    signOut(): Promise<void> {
      return act({ method: "DELETE", url: `${origin}/diner/session`, headers: asDevice() });
    },

    /** Approved comments of a dish, newest first, a page at a time; for everyone. */
    comments(branchId: string, dishId: string, cursor?: string): Promise<Page<PublicComment>> {
      return get(
        withCursor(`${branchPath(branchId)}/dishes/${encodeURIComponent(dishId)}/comments`, cursor),
        publicCommentPageSchema,
      );
    },

    /**
     * Posts a comment, born pending moderation. The client id makes a retry after a
     * timeout return the same comment instead of a second one.
     */
    postComment(comment: { branchId: string; dishId: string; text: string; clientId: string }): Promise<OwnComment> {
      return call(json("POST", "/comments", comment), ownCommentSchema);
    },

    /** The diner's own comments, whatever their state. */
    myComments(cursor?: string): Promise<Page<OwnComment>> {
      return call(
        { method: "GET", url: `${origin}${withCursor("/comments/mine", cursor)}`, headers: asDevice() },
        ownCommentPageSchema,
      );
    },

    /** Edits a comment; it goes back to moderation. */
    editComment(commentId: string, text: string): Promise<OwnComment> {
      return call(json("PATCH", `/comments/${encodeURIComponent(commentId)}`, { text }), ownCommentSchema);
    },

    deleteComment(commentId: string): Promise<void> {
      return act({
        method: "DELETE",
        url: `${origin}/comments/${encodeURIComponent(commentId)}`,
        headers: asDevice(),
      });
    },
  };
}

export type DinerApi = ReturnType<typeof createDinerApi>;
