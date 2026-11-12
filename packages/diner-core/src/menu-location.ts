/** The three densities of the menu; two columns is the main view (design, 2026-11-09). */
export const MENU_VIEWS = ["grid2", "grid3", "feed"] as const;
export type MenuView = (typeof MENU_VIEWS)[number];
export const DEFAULT_MENU_VIEW: MenuView = "grid2";

/**
 * Where the diner is inside a branch's menu. It lives in the URL's query, so the
 * system's back button, a reload and a shared link keep it (design-system: changing
 * density keeps the active dish, the filters and the restaurant).
 */
export interface MenuLocation {
  view: MenuView;
  /** The active dish; null means the first one visible. */
  dishId: string | null;
  /** The category filter; null means every category. */
  categoryId: string | null;
  /** The editorial detail of the active dish is open on top. */
  detail: boolean;
}

export const HOME_LOCATION: MenuLocation = {
  view: DEFAULT_MENU_VIEW,
  dishId: null,
  categoryId: null,
  detail: false,
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queryValues(search: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const pair of search.replace(/^\?/, "").split("&")) {
    const [name, value = ""] = pair.split("=");
    if (name === undefined || name.length === 0) continue;
    try {
      values.set(decodeURIComponent(name), decodeURIComponent(value));
    } catch {
      // A malformed escape is ignored like any other invalid value.
    }
  }
  return values;
}

/** Reads a location from a URL's query; anything invalid falls back to its default. */
export function parseMenuLocation(search: string): MenuLocation {
  const values = queryValues(search);
  const view = values.get("view");
  const dishId = values.get("dish");
  const categoryId = values.get("category");
  const validDish = dishId !== undefined && ID.test(dishId) ? dishId : null;
  return {
    view: (MENU_VIEWS as readonly string[]).includes(view ?? "")
      ? (view as MenuView)
      : DEFAULT_MENU_VIEW,
    dishId: validDish,
    categoryId:
      categoryId !== undefined && ID.test(categoryId) ? categoryId : null,
    detail: validDish !== null && values.get("detail") === "1",
  };
}

/** The query for a location, without the defaults: the home view is an empty query. */
export function menuLocationSearch(location: MenuLocation): string {
  const parts: string[] = [];
  if (location.view !== DEFAULT_MENU_VIEW) parts.push(`view=${location.view}`);
  if (location.dishId !== null) parts.push(`dish=${location.dishId}`);
  if (location.categoryId !== null)
    parts.push(`category=${location.categoryId}`);
  if (location.detail && location.dishId !== null) parts.push("detail=1");
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

/**
 * Where back lands. Leaving the feed carries its active dish to the grid, so the grid
 * marks the last dish the diner saw (decided 2026-11-12), not the one that opened it.
 */
export function locationAfterBack(
  leaving: MenuLocation,
  arriving: MenuLocation,
): MenuLocation {
  return leaving.view === "feed" &&
    arriving.view !== "feed" &&
    leaving.dishId !== null
    ? { ...arriving, dishId: leaving.dishId }
    : arriving;
}

/**
 * Whether moving between two locations deserves its own step in the history, so back
 * undoes it: opening the feed from a grid, or opening the detail. Changing density,
 * the filter or the active dish replaces the current step instead.
 */
export function isForwardStep(from: MenuLocation, to: MenuLocation): boolean {
  return (
    (to.detail && !from.detail) || (from.view !== "feed" && to.view === "feed")
  );
}
