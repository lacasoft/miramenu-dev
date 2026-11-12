import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/**
 * True while the page is hidden: the phone locked, another app or tab in front. A video
 * never keeps playing behind the diner's back (design-system §9).
 */
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "hidden",
  );
}
