import { useSyncExternalStore } from "react";

/** Told when the app moves on its own; the browser's Back and Forward fire popstate. */
const NAVIGATED = "miramenu:navigated";

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATED, onChange);
  };
};

export interface AppLocation {
  pathname: string;
  search: string;
  hash: string;
}

let cached: { href: string; location: AppLocation } | null = null;

/** The same object while the URL stays the same, as useSyncExternalStore needs. */
function snapshot(): AppLocation {
  const { href, pathname, search, hash } = window.location;
  if (cached?.href !== href) cached = { href, location: { pathname, search, hash } };
  return cached.location;
}

/** Where the admin is: the URL is the app's state of navigation (ADR-0047). */
export function useLocation(): AppLocation {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Moves to one of the app's pages: a step of the history, or in place of this one. */
export function navigate(href: string, { replace = false } = {}): void {
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(NAVIGATED));
}
