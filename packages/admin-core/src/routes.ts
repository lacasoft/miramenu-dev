import { paramsOf } from "./query.ts";

/**
 * The admin's screens and where each lives in the URL (ADR-0047). Every phase adds its
 * own; a path the app does not know is notFound, never a guess.
 */
export type AdminRoute =
  /** `next`: where to go back after signing in; `notice`: why the admin is here. */
  | { screen: "signIn"; next: string | null; notice: SignInNotice | null }
  /** The token comes in the fragment, never in the path (ADR-0033). */
  | { screen: "invitation" }
  | { screen: "home" }
  /** The superadmin creates a business with its first admin. */
  | { screen: "newBusiness" }
  | { screen: "business"; businessId: string }
  | { screen: "team"; businessId: string }
  /** The business's base menu: its draft and its publication. */
  | { screen: "menu"; businessId: string }
  /** The comments of every branch of the business waiting for a moderator. */
  | { screen: "businessModeration"; businessId: string }
  /** The business's figures, grouped over every branch. */
  | { screen: "businessDashboard"; businessId: string }
  | { screen: "branch"; branchId: string }
  /** A branch's menu: its adjustments of the base, its own dishes, profile and publication. */
  | { screen: "branchMenu"; branchId: string }
  /** The branch's comments waiting for a moderator. */
  | { screen: "branchModeration"; branchId: string }
  /** One branch's figures. */
  | { screen: "branchDashboard"; branchId: string }
  | { screen: "notFound" };

/** The session had ended, or an invitation was just accepted. */
export type SignInNotice = "ended" | "invited";

const NOTICES: readonly SignInNotice[] = ["ended", "invited"];
const noticeOf = (value: string | undefined): SignInNotice | null =>
  NOTICES.find((notice) => notice === value) ?? null;

export const SIGN_IN_PATH = "/login";
/** The API's invitation emails link here (`ADMIN_APP_URL/invitation#token=…`). */
export const INVITATION_PATH = "/invitation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The app's pages behind the session, by the segments of their path. */
function pageOf(segments: readonly string[]): AdminRoute {
  const [first, second, third, ...rest] = segments;
  if (rest.length > 0) return { screen: "notFound" };
  if (first === "businesses" && second === "new" && third === undefined)
    return { screen: "newBusiness" };
  if (first === "businesses" && second !== undefined && UUID.test(second)) {
    if (third === undefined) return { screen: "business", businessId: second };
    if (third === "team") return { screen: "team", businessId: second };
    if (third === "menu") return { screen: "menu", businessId: second };
    if (third === "comments") return { screen: "businessModeration", businessId: second };
    if (third === "dashboard") return { screen: "businessDashboard", businessId: second };
  }
  if (first === "branches" && second !== undefined && UUID.test(second)) {
    if (third === undefined) return { screen: "branch", branchId: second };
    if (third === "menu") return { screen: "branchMenu", branchId: second };
    if (third === "comments") return { screen: "branchModeration", branchId: second };
    if (third === "dashboard") return { screen: "branchDashboard", branchId: second };
  }
  return { screen: "notFound" };
}

const normalized = (pathname: string) =>
  pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

export function routeOf(location: { pathname: string; search: string }): AdminRoute {
  const path = normalized(location.pathname);
  if (path === SIGN_IN_PATH) {
    const params = paramsOf(location.search);
    return {
      screen: "signIn",
      next: safeNext(params.get("next") ?? null),
      notice: noticeOf(params.get("notice")),
    };
  }
  if (path === INVITATION_PATH) return { screen: "invitation" };
  if (path === "/") return { screen: "home" };
  return pageOf(path.slice(1).split("/"));
}

export function hrefOf(route: AdminRoute): string {
  switch (route.screen) {
    case "signIn": {
      const query = [
        ...(route.next === null ? [] : [`next=${encodeURIComponent(route.next)}`]),
        ...(route.notice === null ? [] : [`notice=${route.notice}`]),
      ];
      return query.length === 0 ? SIGN_IN_PATH : `${SIGN_IN_PATH}?${query.join("&")}`;
    }
    case "invitation":
      return INVITATION_PATH;
    case "newBusiness":
      return "/businesses/new";
    case "business":
      return `/businesses/${route.businessId}`;
    case "team":
      return `/businesses/${route.businessId}/team`;
    case "menu":
      return `/businesses/${route.businessId}/menu`;
    case "businessModeration":
      return `/businesses/${route.businessId}/comments`;
    case "businessDashboard":
      return `/businesses/${route.businessId}/dashboard`;
    case "branch":
      return `/branches/${route.branchId}`;
    case "branchMenu":
      return `/branches/${route.branchId}/menu`;
    case "branchModeration":
      return `/branches/${route.branchId}/comments`;
    case "branchDashboard":
      return `/branches/${route.branchId}/dashboard`;
    case "home":
    case "notFound":
      return "/";
  }
}

/** Every screen but signing in and accepting an invitation is behind the session. */
export const needsSession = (route: AdminRoute): boolean =>
  route.screen !== "signIn" && route.screen !== "invitation";

/**
 * Where to go back after signing in: one of the app's own pages behind the session, as a
 * path and query. Anything else (another site, `//host`, a backslash, signing in again)
 * is dropped, so the link can never send the admin away (CWE-601).
 */
export function safeNext(next: string | null): string | null {
  if (next === null || !next.startsWith("/") || next.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return null;
  const at = next.search(/[?#]/);
  const pathname = at < 0 ? next : next.slice(0, at);
  const search = at < 0 || next[at] === "#" ? "" : next.slice(at).replace(/#.*$/, "");
  return needsSession(routeOf({ pathname, search })) ? `${pathname}${search}` : null;
}
