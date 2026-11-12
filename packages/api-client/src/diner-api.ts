import {
  branchInteractionsSchema,
  DEVICE_ID_HEADER,
  likeStateSchema,
  myLikesSchema,
  publishedMenuSchema,
  resolutionSchema,
  type BranchInteractions,
  type LikeState,
  type MyLikes,
  type PublishedMenu,
  type Resolution,
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

  async function call<T>(request: HttpRequest, schema: Schema<T>): Promise<T> {
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
      throw new ApiError(failureOf(response.status, body));
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
  };
}

export type DinerApi = ReturnType<typeof createDinerApi>;
